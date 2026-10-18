// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IOFT, SendParam, MessagingFee, OFTReceipt, MessagingReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { SepetDefteri } from "../sepet/SepetDefteri.sol";
import { IERC20S, Adres } from "../sepet/IHaberci.sol";

interface ILaunchpadM {
    function launch(string calldata ad, string calldata sembol, SepetDefteri.Kalem[] calldata sepet, uint256[] calldata teklif,
        uint256 vergiPpm, uint256 alim) external returns (address token, address kasa);
    function havuzAnahtari(address token) external view returns (PoolKey memory);
}

interface IIkizYayiciM {
    function adapterAdresi(address token) external view returns (address);
    function yay(address token, uint32[] calldata hedefler, bytes calldata secenekler) external payable;
}

interface IHaberciM {
    function zincir() external view returns (uint32);
    function gonder(uint32 hedefZincir, bytes32 hedef, bytes calldata veri, uint256 miktar) external;
}

interface ISepetUcuM {
    function itfa(address token, uint256 miktar, uint32 hedefZincir, bytes32 alici) external;
}

/// @title KurucuVekili — the founder of one launch made through MerkezKapi
/// @notice The launchpad records whoever calls it as the founder and pays the
///         founder's slice of every trade there. A launch that arrives from
///         another chain is executed by relay.link's contract, not by the
///         founder; so each launch gets this small contract as its founder of
///         record. It does nothing but pass on what the founder is owed:
///         `ilet` (anyone may call it) sends its dollars to the founder, on
///         the founder's chain, through the Haberci (CCTP; BNB through the
///         island gate). No owner, nothing else can move.
contract KurucuVekili {
    address public immutable kapi;
    bytes32 public immutable kurucu;
    uint32 public immutable kurucuZincir;
    IERC20S public immutable usdc;
    IHaberciM public immutable haberci;

    uint256 public constant ASGARI_ILET = 1e6;   // $1: below it a cross-chain delivery costs more than it carries

    event Iletildi(uint32 zincir, bytes32 kurucu, uint256 miktar);
    error SadeceKapi();
    error Az();
    error TransferOlmadi();

    constructor(bytes32 kurucu_, uint32 kurucuZincir_, IERC20S usdc_, IHaberciM haberci_) {
        kapi = msg.sender;
        kurucu = kurucu_;
        kurucuZincir = kurucuZincir_;
        usdc = usdc_;
        haberci = haberci_;
    }

    /// The launch, made by this contract as founder of record. The founder's
    /// tokens go straight back to the gate, which delivers them.
    function launchEt(ILaunchpadM lp, string calldata ad, string calldata sembol, SepetDefteri.Kalem[] calldata sepet,
        uint256[] calldata teklif, uint256 vergiPpm, uint256 alim, uint256 toplam) external returns (address token, uint256 kurucuToken)
    {
        if (msg.sender != kapi) revert SadeceKapi();
        if (!usdc.approve(address(lp), toplam)) revert TransferOlmadi();
        (token,) = lp.launch(ad, sembol, sepet, teklif, vergiPpm, alim);
        kurucuToken = IERC20S(token).balanceOf(address(this));
        if (!IERC20S(token).transfer(kapi, kurucuToken)) revert TransferOlmadi();
    }

    /// Anyone: the founder's trading income, to the founder.
    function ilet() external {
        uint256 b = usdc.balanceOf(address(this));
        bool burada = kurucuZincir == haberci.zincir();
        if (b == 0 || (!burada && b < ASGARI_ILET)) revert Az();
        if (burada) {
            if (!usdc.transfer(Adres.evm(kurucu), b)) revert TransferOlmadi();
        } else {
            if (!usdc.approve(address(haberci), b)) revert TransferOlmadi();
            haberci.gonder(kurucuZincir, kurucu, "", b);
        }
        emit Iletildi(kurucuZincir, kurucu, b);
    }
}

/// @title MerkezKapi — every chain's door to the one pool on Arc
///
/// THE MODEL (18 Oct 2026, user: "kasa hep Arc'ta, adam istediği gas
/// tokeniyle alıp satsın"): each launch has ONE pool, on Arc, where all
/// depth and the one price live. The token exists on the other chains as
/// its LayerZero twin (IkizYayici, same address on the eight EVM chains).
/// People pay and are paid on their own chain in whatever they hold:
/// relay.link turns that into Arc USDC and calls this gate in the same
/// order (one signature, measured with FTHM on 15 Oct), and a sale's
/// dollars reach the seller's chain through the Haberci (CCTP; BNB through
/// the island gate), where the site swaps them into what the seller wants.
///
///   launch   relay brings the founder's dollars; a KurucuVekili makes the
///            launch on PulseLaunchpad5 (its pool on Arc, its basket through
///            the Defter as for any launch), the twins are placed on the
///            chosen chains, the founder's tokens go to the founder's chain
///   al       relay brings a buyer's dollars; bought in the Arc pool, the
///            tokens go to the buyer's chain (or stay on Arc)
///   lzCompose  twins sent here from any chain with an order: SAT sells
///            them in the Arc pool and pays the seller's chain; ITFA
///            redeems them from the basket (SepetUcu.itfa) and has the basket
///            pay the seller's chain
///
/// WHO IS TRUSTED FOR WHAT: nobody holds anything here between calls. A
/// buy that cannot meet its minimum reverts (relay refunds); a sale or a
/// redemption that cannot be carried out hands the tokens to the seller's
/// fallback address on Arc instead of stranding them. Only the LayerZero
/// endpoint, relaying a launch token's own Arc adapter, can trigger a sale.
/// No owner; the five addresses below are fixed at construction.
contract MerkezKapi {
    ILaunchpadM public immutable launchpad;
    IPoolManager public immutable havuzYoneticisi;
    IIkizYayiciM public immutable ikizYayici;
    IHaberciM public immutable haberci;
    ISepetUcuM public immutable ucu;
    IERC20S public immutable usdc;
    address public immutable lzUcNokta;

    uint8 public constant SAT = 0;
    uint8 public constant ITFA = 1;
    uint8 private constant ALIM_MODU = 1;
    uint8 private constant SATIS_MODU = 0;

    /// launch token -> its founder of record
    mapping(address => address) public vekilOf;
    /// a launch token's Arc adapter -> the token (set at launch)
    mapping(address => address) public tokenOfAdapter;

    struct LaunchIstegi {
        string ad;
        string sembol;
        SepetDefteri.Kalem[] sepet;
        uint256[] teklif;
        uint256 vergiPpm;
        uint256 alim;
        bytes32 kurucu;          // the founder, on their chain (32 bytes)
        uint32 kurucuZincir;     // CCTP domain where the founder is paid
        uint32 kurucuEid;        // LayerZero eid where the founder's tokens go (0: on Arc)
        uint32[] ikizler;        // chains to place the twin on now
        bytes ikizSecenek;       // LayerZero options for the twin messages (~3.5M gas)
        uint256 ikizUcret;       // native value for the twins, out of msg.value
        bytes gonderSecenek;     // LayerZero options for the founder's tokens
        address iade;            // where unused native value goes
    }

    event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken);
    event Alindi(address indexed token, uint256 girdi, uint256 alinan, uint32 hedefEid, bytes32 alici);
    event Satildi(address indexed token, uint256 miktar, uint256 cikan, uint32 odemeZincir, bytes32 alici);
    event ItfaEdildi(address indexed token, uint256 miktar, uint32 odemeZincir, bytes32 alici);
    event Teslim(address indexed token, address kime, uint256 miktar, uint8 neden);

    error SadeceUcNokta();
    error SadeceKendisi();
    error SadeceHavuzYoneticisi();
    error BilinmeyenToken();
    error AzCikti(uint256 cikti, uint256 asgari);
    error TransferOlmadi();
    error IadeOlmadi();

    constructor(ILaunchpadM lp_, IPoolManager pm_, IIkizYayiciM yayici_, IHaberciM haberci_, ISepetUcuM ucu_, IERC20S usdc_, address lz_) {
        launchpad = lp_;
        havuzYoneticisi = pm_;
        ikizYayici = yayici_;
        haberci = haberci_;
        ucu = ucu_;
        usdc = usdc_;
        lzUcNokta = lz_;
    }

    receive() external payable {}

    /* ------------------------------------------------------ launch ---- */

    function launch(LaunchIstegi calldata r) external payable returns (address token) {
        uint256 teminat;
        for (uint256 i = 0; i < r.sepet.length; i++) teminat += r.sepet[i].dolar;
        uint256 toplam = r.alim + teminat;
        _cek(address(usdc), toplam);
        KurucuVekili v = new KurucuVekili(r.kurucu, r.kurucuZincir, usdc, haberci);
        if (!usdc.transfer(address(v), toplam)) revert TransferOlmadi();
        uint256 kurucuToken;
        (token, kurucuToken) = v.launchEt(launchpad, r.ad, r.sembol, r.sepet, r.teklif, r.vergiPpm, r.alim, toplam);
        vekilOf[token] = address(v);

        /* the twins: IkizYayici creates the Arc adapter and messages each chain */
        ikizYayici.yay{ value: r.ikizUcret }(token, r.ikizler, r.ikizSecenek);
        address adapter = ikizYayici.adapterAdresi(token);
        tokenOfAdapter[adapter] = token;
        if (!IERC20S(token).approve(adapter, type(uint256).max)) revert TransferOlmadi();

        _teslimEt(token, adapter, kurucuToken, r.kurucuEid, r.kurucu, r.gonderSecenek, address(this).balance, r.iade);
        _yerelIade(r.iade);
        emit MerkezLaunch(token, address(v), r.kurucu, r.kurucuZincir, kurucuToken);
    }

    /* --------------------------------------------------------- buy ---- */

    /// Buy `token` in the Arc pool with `girdi` USDC (pulled from the
    /// caller: relay's contract, or anyone) and deliver at least `asgari`
    /// to `alici` on `hedefEid` (0: on Arc). msg.value pays LayerZero.
    function al(address token, uint256 girdi, uint256 asgari, uint32 hedefEid, bytes32 alici, bytes calldata secenek, address iade)
        external payable returns (uint256 alinan)
    {
        if (vekilOf[token] == address(0)) revert BilinmeyenToken();
        _cek(address(usdc), girdi);
        alinan = abi.decode(havuzYoneticisi.unlock(abi.encode(ALIM_MODU, token, girdi, address(this))), (uint256));
        if (alinan < asgari) revert AzCikti(alinan, asgari);
        _teslimEt(token, ikizYayici.adapterAdresi(token), alinan, hedefEid, alici, secenek, msg.value, iade);
        /* a buy stopped at the price limit leaves dollars unspent */
        uint256 kalan = usdc.balanceOf(address(this));
        if (kalan > 0 && !usdc.transfer(iade, kalan)) revert TransferOlmadi();
        _yerelIade(iade);
        emit Alindi(token, girdi, alinan, hedefEid, alici);
    }

    /* ---------------------------------------------- sell / redeem ---- */

    /// LayerZero delivers the compose after the twin's tokens are credited
    /// here through the token's Arc adapter. Payload:
    ///   abi.encode(uint8 tur, uint32 odemeZincir, bytes32 alici, uint256 asgari, address yedek)
    function lzCompose(address from, bytes32, bytes calldata mesaj, address, bytes calldata) external payable {
        if (msg.sender != lzUcNokta) revert SadeceUcNokta();
        address token = tokenOfAdapter[from];
        if (token == address(0)) revert BilinmeyenToken();
        uint256 miktar = OFTComposeMsgCodec.amountLD(mesaj);
        bytes memory istek = OFTComposeMsgCodec.composeMsg(mesaj);
        address gonderen = OFTComposeMsgCodec.bytes32ToAddress(OFTComposeMsgCodec.composeFrom(mesaj));
        /* Anyone can bridge tokens here with any payload. One that is not
           ours would make every retry revert and strand them, so it is not
           decoded: the tokens go to the sender's address on Arc. */
        if (istek.length != 160) { _ver(token, gonderen, miktar, 0); return; }
        (uint8 tur, uint32 odemeZincir, bytes32 alici, uint256 asgari, address yedek) =
            abi.decode(istek, (uint8, uint32, bytes32, uint256, address));
        if (yedek == address(0)) yedek = gonderen;
        if (tur == SAT) {
            try this.sat(token, miktar, asgari, odemeZincir, alici) returns (uint256 cikan) {
                emit Satildi(token, miktar, cikan, odemeZincir, alici);
                /* what a price limit left unsold goes to the seller's fallback on Arc */
                uint256 kalan = IERC20S(token).balanceOf(address(this));
                if (kalan > 0) _ver(token, yedek, kalan, 4);
            } catch { _ver(token, yedek, miktar, 1); }
        } else if (tur == ITFA) {
            try this.itfaEt(token, miktar, odemeZincir, alici) {
                emit ItfaEdildi(token, miktar, odemeZincir, alici);
            } catch { _ver(token, yedek, miktar, 2); }
        } else {
            _ver(token, yedek, miktar, 3);
        }
    }

    /// Only from `lzCompose`, so a failure can be caught and turned into a delivery.
    function sat(address token, uint256 miktar, uint256 asgari, uint32 odemeZincir, bytes32 alici) external returns (uint256 cikan) {
        if (msg.sender != address(this)) revert SadeceKendisi();
        cikan = abi.decode(havuzYoneticisi.unlock(abi.encode(SATIS_MODU, token, miktar, address(this))), (uint256));
        if (cikan < asgari) revert AzCikti(cikan, asgari);
        _ode(odemeZincir, alici, cikan);
    }

    /// Only from `lzCompose`: burn through the chain entry; the basket pays `alici` on `odemeZincir`.
    function itfaEt(address token, uint256 miktar, uint32 odemeZincir, bytes32 alici) external {
        if (msg.sender != address(this)) revert SadeceKendisi();
        if (!IERC20S(token).approve(address(ucu), miktar)) revert TransferOlmadi();
        ucu.itfa(token, miktar, odemeZincir, alici);
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        if (msg.sender != address(havuzYoneticisi)) revert SadeceHavuzYoneticisi();
        (uint8 mod, address token, uint256 girdi, address alici) = abi.decode(v, (uint8, address, uint256, address));
        PoolKey memory k = launchpad.havuzAnahtari(token);
        bool tokenSifirinci = Currency.unwrap(k.currency0) == token;
        /* a sale puts the token in, a buy puts the dollar in */
        bool sifirdanBire = (mod == SATIS_MODU) == tokenSifirinci;
        BalanceDelta d = havuzYoneticisi.swap(
            k,
            SwapParams(sifirdanBire, -int256(girdi), sifirdanBire ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            ""
        );
        (int128 giren, int128 cikan) = sifirdanBire ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        (Currency gc, Currency cc) = sifirdanBire ? (k.currency0, k.currency1) : (k.currency1, k.currency0);
        uint256 odenecek = uint256(uint128(-giren));
        havuzYoneticisi.sync(gc);
        if (!IERC20S(Currency.unwrap(gc)).transfer(address(havuzYoneticisi), odenecek)) revert TransferOlmadi();
        havuzYoneticisi.settle();
        uint256 alinan = uint256(uint128(cikan));
        havuzYoneticisi.take(cc, alici, alinan);
        return abi.encode(alinan);
    }

    /* ----------------------------------------------------- helpers ---- */

    /// Tokens to `alici` on `eid` through the Arc adapter, or here on Arc (eid 0).
    function _teslimEt(address token, address adapter, uint256 miktar, uint32 eid, bytes32 alici, bytes calldata secenek,
        uint256 deger, address iade) internal
    {
        if (eid == 0) {
            if (!IERC20S(token).transfer(Adres.evm(alici), miktar)) revert TransferOlmadi();
            return;
        }
        SendParam memory p = SendParam(eid, alici, miktar, 0, secenek, "", "");
        IOFT(adapter).send{ value: deger }(p, MessagingFee(deger, 0), iade);
        /* dust below the bridge's shared decimals cannot cross */
        uint256 toz = IERC20S(token).balanceOf(address(this));
        if (toz > 0 && !IERC20S(token).transfer(iade, toz)) revert TransferOlmadi();
    }

    /// Dollars to `alici` on `zincir`: here directly, elsewhere through the Haberci.
    function _ode(uint32 zincir, bytes32 alici, uint256 miktar) internal {
        if (miktar == 0) return;
        if (zincir == haberci.zincir()) {
            if (!usdc.transfer(Adres.evm(alici), miktar)) revert TransferOlmadi();
        } else {
            if (!usdc.approve(address(haberci), miktar)) revert TransferOlmadi();
            haberci.gonder(zincir, alici, "", miktar);
        }
    }

    function _ver(address token, address kime, uint256 miktar, uint8 neden) internal {
        if (!IERC20S(token).transfer(kime, miktar)) revert TransferOlmadi();
        emit Teslim(token, kime, miktar, neden);
    }

    function _cek(address t, uint256 m) internal {
        if (!IERC20S(t).transferFrom(msg.sender, address(this), m)) revert TransferOlmadi();
    }

    function _yerelIade(address iade) internal {
        uint256 b = address(this).balance;
        if (b > 0) {
            (bool ok,) = payable(iade).call{ value: b }("");
            if (!ok) revert IadeOlmadi();
        }
    }
}
