// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Q {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function approve(address spender, uint256 v) external returns (bool);

    /// Needed because the deposit range is written in dollars and has to be
    /// stored in whatever unit this particular token counts in. Arc's USDC
    /// uses six decimals; assuming eighteen made the range a thousand
    /// billion times too large, which is a limit that refuses everybody.
    function decimals() external view returns (uint8);
}

interface ILaunchpadQ {
    /// The one address whose launch fee the launchpad waives. Needed so this
    /// contract can tell whether the fee is its job or the launchpad's.
    function queue() external view returns (address);

    function launch(
        string calldata name,
        string calldata symbol,
        address collateralToken,
        uint256 deposit,
        uint256 quoteValue,
        uint256 poolBps
    ) external returns (address token, address vault, address rewards);
}

/// @title LaunchQueue
/// @notice What a customer actually touches. They pay USDC, pick a stock,
///         and receive a meme token. Everything between those two facts is
///         the system's problem.
///
/// WHAT THE CUSTOMER SEES
///   One transaction, in USDC. They never hold a wrapped stock, never see
///   Robinhood Chain, never bridge anything and never hold ETH. The meme
///   token they end up with is backed by a tokenized share that this
///   system bought on their behalf — but that is a fact about the vault,
///   not a step they perform.
///
/// WHY THERE IS A QUEUE AT ALL
///   Because Arc has no general message bridge. Checked, not assumed:
///   neither LayerZero nor CCIP is deployed on it. So no contract on Arc
///   can reach Robinhood Chain, buy a share and come back inside one
///   transaction. Somebody has to carry the money across, and that
///   somebody is an operator with an account on both chains.
///
///   That is the one piece of this product that is not enforced by code,
///   so it is worth being exact about what the operator can and cannot do.
///
/// THE OPERATOR CANNOT TOUCH THE CUSTOMER'S MONEY
///   `fulfil` is the only way a request leaves this contract, and it runs
///   in one transaction: the operator delivers the wrapped stock, the
///   launch is created for the customer, and only then is the operator
///   paid the USDC. If any part fails, all of it fails. The operator is
///   therefore fronting capital and being reimbursed — never holding a
///   deposit.
///
///   There is deliberately no function that advances the USDC before
///   delivery. It would be convenient, it would remove the operator's need
///   for working capital, and it would turn this from a reimbursement into
///   a custody arrangement. The cost of not having it is ours to carry.
///
/// IF NOBODY DELIVERS
///   Every request carries a deadline. After it passes the customer calls
///   `refund` and takes their USDC back, less the fee that was already
///   split. No permission, no operator cooperation, no multisig. A queue
///   that can strand money is not a queue, it is a deposit box with
///   someone else's key.
///
/// THE FEE
///   2% of the deposit, taken on entry and split in the house proportions:
///   30% to the launch's holder rewards — held here until the launch
///   exists, since that contract is created by the launch itself — 30% to
///   the outside-developer pool, 40% to the protocol. On a refund the
///   holder slice has nowhere to go, so it goes back to the customer with
///   the rest of their money rather than sitting here forever.
contract LaunchQueue {
    /// The entry fee, 2.00%, in hundredths of a basis point.
    ///
    /// WHO ACTUALLY CHARGES IT
    ///   The launchpad charges the same 2% in the same proportions, and
    ///   waives it for exactly one address, fixed once by setQueue and never
    ///   changeable. So the fee belongs to whichever of the two is not
    ///   waived, and `ucretPpm()` asks rather than assuming.
    ///
    ///   The first queue was waived. It was replaced because its deposit
    ///   range was written in 18 decimals against a 6-decimal USDC, and
    ///   setQueue cannot be pointed at the replacement. Hard-coding zero
    ///   here would have fixed that and quietly broken the next launchpad
    ///   deployed fresh, where the waiver is still unspent.
    ///
    ///   Charging in the collateral rather than in USDC changes the asset
    ///   the fee arrives in, not its size: the launchpad takes 2% of the
    ///   tokenized share, which is 2% of the same deposit.
    uint256 public constant TAM_UCRET_PPM = 20000;  // 2.00%

    /// What a customer may pay, in dollars. The launchpad cannot hold this
    /// range: by the time a deposit reaches it the money is a tokenized
    /// share, and a share count says nothing about what it is worth.
    ///
    /// The floor is where a launch stops being worth trading; the cap keeps
    /// launches comparable to one another.
    uint256 public constant MIN_DOLAR = 100;
    uint256 public constant MAX_DOLAR = 1500;

    /// The same two numbers in the token's own unit, read off the token at
    /// construction rather than written down here.
    ///
    /// These were `100 ether` and `1500 ether`. Arc's USDC has six
    /// decimals, so that was a hundred trillion dollars and the deposit
    /// range rejected every real customer. The lesson was expensive enough
    /// to apply structurally: a decimal count belongs to the token, and the
    /// only safe place to get it is from the token.
    uint256 public immutable MIN_USDC;
    uint256 public immutable MAX_USDC;
    uint256 public constant HOLDER_SHARE_BPS = 3000;
    uint256 public constant DEV_SHARE_BPS = 3000;

    /// How long the operator has. Long enough for a relay hop (measured at
    /// about one second), a swap on Robinhood Chain and a wrap, with room
    /// for a stuck transaction; short enough that a customer is not locked
    /// in while they wait. Production value is 30 minutes.
    ///
    /// Immutable rather than constant so a test can reach the far side of
    /// it: every test here runs inside one eth_call, where block.timestamp
    /// cannot be moved. A refund path that ships unexercised is the one
    /// path that must not.
    uint64 public immutable DEADLINE;

    IERC20Q public immutable usdc;
    ILaunchpadQ public immutable launchpad;
    address public immutable governor;
    address public immutable devSink;
    address public immutable protocolSink;

    /// The operator. Immutable: an address that can be repointed is an
    /// address somebody can repoint at themselves.
    address public immutable operator;

    enum Durum { Yok, Acik, Tamam, Iade }

    struct Talep {
        address musteri;
        uint256 usdcNet;      // after the fee
        /* The least collateral the customer will accept for that payment.
           Set by them, enforced on delivery. Without it the operator chose
           the amount and was still reimbursed in full. */
        uint256 enAzTeminat;
        /* And WHICH collateral, pinned when they paid. karsila used to read
           sarmalOf[hisse] again at delivery, so governance relisting the
           ticker between the two would have left the floor denominated in
           an asset the customer never agreed to — the amount survives the
           swap, the meaning does not. Found in review. */
        address sarmal;
        /* The listing's version when the customer paid. The escape is a
           comparison against the current one, and a counter cannot be put
           back — so relisting away and straight back raises it twice
           instead of restoring it.

           A boolean set during the mismatch was tried first and did
           nothing: it could only latch while the mismatch was visible,
           and during a visible mismatch the customer could already
           leave. */
        uint32 hisseSurum;
        uint256 holderPay;    // the holder slice, waiting for a launch
        uint64 sonTarih;
        uint16 poolBps;
        bytes32 hisse;        // ticker, e.g. "NVDA"
        string ad;
        string sembol;
        Durum durum;
        address token;        // filled in on success
    }

    Talep[] public talepler;

    /// Ticker -> the wrapped stock on Arc that backs it. Only governance
    /// can change this set: which shares the product offers is a decision
    /// about risk and liquidity, not an operational knob.
    mapping(bytes32 => address) public sarmalOf;
    /// Bumped on every change to a ticker's listing, never decreased. A
    /// request compares against the value it was created with.
    mapping(bytes32 => uint32) public sarmalSurum;
    bytes32[] public hisseler;

    event TalepAcildi(
        uint256 indexed id, address indexed musteri, bytes32 indexed hisse,
        uint256 usdcNet, uint16 poolBps, uint64 sonTarih, uint256 enAzTeminat
    );
    event TalepTamam(uint256 indexed id, address indexed token, address vault, uint256 teminat);
    /// A request left before its deadline because its ticker's listing had
    /// changed since it was paid for.
    event KacisKullanildi(uint256 indexed id, uint32 odemeSurumu, uint32 simdikiSurum);
    event TalepIade(uint256 indexed id, address indexed musteri, uint256 geri);
    event HisseEklendi(bytes32 indexed hisse, address sarmal);
    event HisseKaldirildi(bytes32 indexed hisse);

    error NotOperator();
    error NotGovernor();
    error NotCustomer();
    error UnknownStock();
    error BadState();
    error TooEarly();
    error TooLate();
    error AmountOutOfRange();
    error TransferFailed();
    error NothingDelivered();
    error AzTeminat();
    error SifirTaban();

    constructor(
        IERC20Q _usdc,
        ILaunchpadQ _launchpad,
        address _operator,
        address _governor,
        address _devSink,
        address _protocolSink,
        uint64 _deadline,
        bytes32[] memory ilkHisseler,
        address[] memory ilkSarmallar
    ) {
        usdc = _usdc;
        uint256 bir = 10 ** uint256(_usdc.decimals());
        MIN_USDC = MIN_DOLAR * bir;
        MAX_USDC = MAX_DOLAR * bir;
        launchpad = _launchpad;
        operator = _operator;
        governor = _governor;
        devSink = _devSink;
        protocolSink = _protocolSink;
        DEADLINE = _deadline;

        /* The list is seeded here and governed afterwards.
         *
         * The first version left it empty and reachable only through a
         * proposal, which was a protection in the wrong place: nothing
         * could be listed for seven days, so the product could not do the
         * one thing it exists for. A guard that stops the thing it guards
         * from existing is not a guard.
         *
         * Seeding at construction is honest about who chose the opening
         * set — whoever deployed this, in public, once — and leaves every
         * later change to a vote. */
        if (ilkHisseler.length != ilkSarmallar.length) revert UnknownStock();
        for (uint256 i = 0; i < ilkHisseler.length; i++) {
            if (ilkSarmallar[i] == address(0)) revert UnknownStock();
            if (sarmalOf[ilkHisseler[i]] == address(0)) hisseler.push(ilkHisseler[i]);
            sarmalOf[ilkHisseler[i]] = ilkSarmallar[i];
            emit HisseEklendi(ilkHisseler[i], ilkSarmallar[i]);
        }
    }

    /// 2% if this contract is the launchpad's waived queue, otherwise 0,
    /// because then the launchpad is taking it. Never both, never neither.
    function ucretPpm() public view returns (uint256) {
        return launchpad.queue() == address(this) ? TAM_UCRET_PPM : 0;
    }

    /// The state of one request.
    ///
    /// The auto-getter returns a positional tuple, and the struct has
    /// gained a field twice now — each time silently breaking every
    /// destructuring that read it by position. A named read costs nothing
    /// and cannot be broken by adding a field.
    function durumu(uint256 id) external view returns (Durum) {
        return talepler[id].durum;
    }

    function talepSayisi() external view returns (uint256) {
        return talepler.length;
    }

    function hisseSayisi() external view returns (uint256) {
        return hisseler.length;
    }

    // ------------------------------------------------------------ customer

    /// Pay USDC, name a stock, get a launch. The only function a customer
    /// needs.
    ///
    /// The amount is checked in USDC, which is what the customer handed
    /// over. What reaches the launchpad is a quantity of shares, and no
    /// range over share counts would mean anything.
    /// @param enAzTeminat the least wrapped stock the customer will accept
    ///        for this payment. Zero is refused: a request with no floor
    ///        is the hole this closes, and defaulting it to something
    ///        would be choosing on the customer's behalf.
    function talepEt(
        bytes32 hisse,
        uint256 usdcAmount,
        uint16 poolBps,
        string calldata ad,
        string calldata sembol,
        uint256 enAzTeminat
    ) external returns (uint256 id) {
        address sarmalSimdi = sarmalOf[hisse];
        if (sarmalSimdi == address(0)) revert UnknownStock();
        if (enAzTeminat == 0) revert SifirTaban();

        if (usdcAmount < MIN_USDC || usdcAmount > MAX_USDC) revert AmountOutOfRange();

        uint256 fee = (usdcAmount * ucretPpm()) / 1_000_000;
        uint256 net = usdcAmount - fee;

        if (!usdc.transferFrom(msg.sender, address(this), usdcAmount)) revert TransferFailed();

        uint256 h = (fee * HOLDER_SHARE_BPS) / 10000;
        uint256 d = (fee * DEV_SHARE_BPS) / 10000;
        uint256 p = fee - h - d;
        if (d > 0 && !usdc.transfer(devSink, d)) revert TransferFailed();
        if (p > 0 && !usdc.transfer(protocolSink, p)) revert TransferFailed();

        id = talepler.length;
        talepler.push(Talep({
            musteri: msg.sender,
            usdcNet: net,
            enAzTeminat: enAzTeminat,
            sarmal: sarmalSimdi,
            hisseSurum: sarmalSurum[hisse],
            holderPay: h,
            sonTarih: uint64(block.timestamp) + DEADLINE,
            poolBps: poolBps,
            hisse: hisse,
            ad: ad,
            sembol: sembol,
            durum: Durum.Acik,
            token: address(0)
        }));

        emit TalepAcildi(id, msg.sender, hisse, net, poolBps,
                         uint64(block.timestamp) + DEADLINE, enAzTeminat);
    }

    /// Take the money back after the deadline. Nobody's permission needed.
    ///
    /// The holder slice comes back too: it was set aside for a launch that
    /// never happened, and there is no holder-reward contract to send it
    /// to. Keeping it would be charging for work not done.
    function iadeAl(uint256 id) external {
        Talep storage t = talepler[id];
        if (t.durum != Durum.Acik) revert BadState();
        if (msg.sender != t.musteri) revert NotCustomer();
        /* The two windows are adjacent and neither overlaps the other:
           the operator may act strictly before the deadline, the customer
           from the deadline onwards.

           One exception, and it is the customer's side of pinning the
           asset. Pinning stops governance substituting what they are owed,
           but it also means a request survives the ticker being delisted —
           karsila reads the pinned address and never consults the current
           listing, so delivery still goes through. That is deliberate:
           governance should not be able to void an agreement somebody has
           already paid for. It should not be able to trap them in one
           either, and a delisting usually means something is wrong with
           the asset.

           So when the listing no longer points at what they pinned, the
           customer may leave at once instead of waiting out the deadline.

           Two things this is NOT, said plainly because the first version
           of this comment claimed both. It is not a guarantee of a
           refund: the operator may still deliver, and if they get there
           first the request settles and there is nothing to refund. And
           the race is not the customer's to control — they choose when to
           ask, not whether the operator moves first.

           The flag is sticky. Checked live it could be opened by a
           relisting and closed again by pointing the ticker back, which
           would leave the escape in the hands of the party it exists to
           protect against. */
        bool listeOynadi = sarmalSurum[t.hisse] != t.hisseSurum;
        if (block.timestamp < t.sonTarih && !listeOynadi) revert TooEarly();
        if (listeOynadi && block.timestamp < t.sonTarih)
            emit KacisKullanildi(id, t.hisseSurum, sarmalSurum[t.hisse]);

        t.durum = Durum.Iade;
        uint256 geri = t.usdcNet + t.holderPay;
        if (!usdc.transfer(t.musteri, geri)) revert TransferFailed();
        emit TalepIade(id, t.musteri, geri);
    }

    // ------------------------------------------------------------ operator

    /// Deliver the collateral and create the launch, in one transaction.
    ///
    /// The operator must have approved `teminat` of the wrapped stock to
    /// this contract. The order matters: collateral arrives, the launch is
    /// created with the customer named as founder, and the operator is
    /// reimbursed last. A failure anywhere reverts the lot, so there is no
    /// state in which the USDC has moved and the launch has not.
    function karsila(uint256 id, uint256 teminat)
        external
        returns (address token, address vault)
    {
        if (msg.sender != operator) revert NotOperator();
        Talep storage t = talepler[id];
        if (t.durum != Durum.Acik) revert BadState();
        if (block.timestamp >= t.sonTarih) revert TooLate();
        if (teminat == 0) revert NothingDelivered();
        /* The floor the customer set when they paid. The operator is
           reimbursed t.usdcNet in full at the end of this function, so
           without this line under-delivering is simply profitable. */
        if (teminat < t.enAzTeminat) revert AzTeminat();

        /* The asset pinned at request time, NOT sarmalOf[t.hisse] today.
           A relisting must not change what the customer is owed; if the
           pinned asset is no longer acceptable the request simply expires
           and iadeAl returns the money without anyone permission. */
        address sarmal = t.sarmal;
        if (sarmal == address(0)) revert UnknownStock();

        if (!IERC20Q(sarmal).transferFrom(msg.sender, address(this), teminat)) revert TransferFailed();

        t.durum = Durum.Tamam;

        IERC20Q(sarmal).approve(address(launchpad), teminat);
        address rewards;
        /* What the customer PAID. Not a valuation of the delivered
           collateral: nothing here prices it, and calling the payment its
           worth would assert a reserve figure this contract has no way to
           know. It is the receipt, and the market opens where the receipt
           says because nobody chooses it — not because it was verified. */
        (token, vault, rewards) =
            launchpad.launch(t.ad, t.sembol, sarmal, teminat, t.usdcNet, t.poolBps);
        t.token = token;

        /* The launch mints its whole supply and hands the founder's share
         * to whoever called it — this contract. It belongs to the customer. */
        uint256 payim = IERC20Q(token).balanceOf(address(this));
        if (payim > 0 && !IERC20Q(token).transfer(t.musteri, payim)) revert TransferFailed();

        /* The holder slice has somewhere to go now. */
        if (t.holderPay > 0 && !usdc.transfer(rewards, t.holderPay)) revert TransferFailed();

        /* Reimbursed last, and only if everything above held. */
        if (!usdc.transfer(operator, t.usdcNet)) revert TransferFailed();

        emit TalepTamam(id, token, vault, teminat);
    }

    // ---------------------------------------------------------- governance

    /// Which shares the product offers. Governance only — a list of
    /// acceptable collateral is a risk decision, and an operator who could
    /// add to it could point a launch at a token of their own making.
    function hisseEkle(bytes32 hisse, address sarmal) external {
        if (msg.sender != governor) revert NotGovernor();
        if (sarmal == address(0)) revert UnknownStock();
        if (sarmalOf[hisse] == address(0)) hisseler.push(hisse);
        sarmalOf[hisse] = sarmal;
        sarmalSurum[hisse]++;
        emit HisseEklendi(hisse, sarmal);
    }

    function hisseKaldir(bytes32 hisse) external {
        if (msg.sender != governor) revert NotGovernor();
        if (sarmalOf[hisse] == address(0)) revert UnknownStock();
        sarmalOf[hisse] = address(0);
        sarmalSurum[hisse]++;
        for (uint256 i = 0; i < hisseler.length; i++) {
            if (hisseler[i] == hisse) {
                hisseler[i] = hisseler[hisseler.length - 1];
                hisseler.pop();
                break;
            }
        }
        emit HisseKaldirildi(hisse);
    }
}
