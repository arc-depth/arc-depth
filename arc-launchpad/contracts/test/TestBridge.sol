// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StockVault, IStock} from "../bridge/StockVault.sol";
import {WrappedStock} from "../bridge/WrappedStock.sol";

/// A stock token that can be split, the way Robinhood's multiplier does it:
/// every balance scales and nobody's proportion changes.
contract MockStock {
    mapping(address => uint256) public rawBalance;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public multiplier = 1e18;
    uint256 public rawTotal;

    function balanceOf(address who) public view returns (uint256) {
        return (rawBalance[who] * multiplier) / 1e18;
    }

    function totalSupply() external view returns (uint256) {
        return (rawTotal * multiplier) / 1e18;
    }

    function mintRaw(address to, uint256 raw) external {
        rawBalance[to] += raw;
        rawTotal += raw;
    }

    /// A 2:1 split doubles every balance at once.
    function applySplit(uint256 factor) external {
        multiplier *= factor;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        uint256 raw = (v * 1e18) / multiplier;
        rawBalance[msg.sender] -= raw;
        rawBalance[to] += raw;
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        uint256 raw = (v * 1e18) / multiplier;
        rawBalance[f] -= raw;
        rawBalance[t] += raw;
        return true;
    }
}

/// @notice The vault's share accounting across a stock split, and — the new
///         part — whether a release or a mint can be made to happen without
///         the signatures that are supposed to authorise it.
///
/// WHY THE SIGNATURES COME FROM OUTSIDE
///   Solidity cannot produce an ECDSA signature; there are no private keys
///   in here. A harness that signed its own notices would be testing a
///   mock, and the hole being closed is exactly the kind a mock hides. So
///   the runner generates real keys, signs the real digest, and passes the
///   bytes in — and the negative cases (too few, a stranger, a duplicate,
///   an amount changed after signing) are real signatures too, just wrong
///   ones.
///
///   The digest binds the verifying contract's own address, which is only
///   known once it exists. `adresler` runs the same deployment sequence
///   with the same arguments and reports where everything landed, so the
///   runner can sign for the addresses the next call will produce.
///   eth_call is deterministic and keeps nothing between calls, so the
///   second deployment lands exactly where the first did.
contract TestBridge {
    /// One deployment order, shared by every test, so the addresses
    /// `adresler` reports are the addresses the tests will use.
    function _kur(
        address[] calldata imzacilar,
        uint256 esik,
        uint256 kaynakZincir,
        uint256 islemTavani,
        uint256 pencere,
        uint256 pencereTavani
    ) internal returns (MockStock stock, StockVault vault, WrappedStock w) {
        stock = new MockStock();
        vault = new StockVault(IStock(address(stock)), imzacilar, esik,
                               kaynakZincir, islemTavani, pencere, pencereTavani);
        w = new WrappedStock("Wrapped AAPL", "wAAPL", imzacilar, esik,
                             kaynakZincir, islemTavani, pencere, pencereTavani);
    }

    struct Kur {
        address[] imzacilar;
        uint256 esik;
        uint256 kaynakZincir;
        uint256 islemTavani;
        uint256 pencere;
        uint256 pencereTavani;
    }

    function adresler(Kur calldata k)
        external returns (address stock, address vault, address wrapped)
    {
        (MockStock s, StockVault v, WrappedStock w) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        return (address(s), address(v), address(w));
    }

    /// The digests a freshly deployed KopruKanit would compute.
    ///
    /// Has to happen inside ONE call: the vault only exists for the
    /// duration of the eth_call that deploys it, so asking it a question
    /// in a second call reaches an address with no code and gets back an
    /// empty answer — which looks exactly like a digest mismatch and is
    /// not one. That is how the first version of dene-ozet.js failed.
    function ozetler(
        Kur calldata k,
        bytes32[] calldata olayIdler,
        address[] calldata aliciler,
        uint256[] calldata miktarlar
    ) external returns (address dogrulayan, bytes32[] memory cikti) {
        (, StockVault vault,) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        dogrulayan = address(vault);
        cikti = new bytes32[](olayIdler.length);
        for (uint256 i = 0; i < olayIdler.length; i++)
            cikti[i] = vault.ozet(olayIdler[i], aliciler[i], miktarlar[i]);
    }

    struct Bolunme {
        uint256 payOnce;
        uint256 paySonra;      // must be unchanged by the split
        uint256 fiyatOnce;
        uint256 fiyatSonra;    // must double
        uint256 cekilen;       // released after the split
        uint256 kasaKalan;
    }

    /// The split case, with a real signed release at the end of it.
    function runBolunme(Kur calldata k, uint256 miktar, uint256 pay, bytes[] calldata imzalar)
        external returns (Bolunme memory b)
    {
        (MockStock stock, StockVault vault,) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);

        stock.mintRaw(address(this), miktar);
        stock.approve(address(vault), type(uint256).max);

        vault.lock(miktar, address(0xA11CE));
        b.payOnce = vault.totalShares();
        b.fiyatOnce = vault.sharePrice();

        stock.applySplit(2);

        b.paySonra = vault.totalShares();
        b.fiyatSonra = vault.sharePrice();

        /* Half the shares, after the split: should receive half of the
           now-doubled balance. The runner signed for exactly this `pay`. */
        b.cekilen = vault.release(keccak256("burn-1"), address(0xB0B), pay, imzalar);
        b.kasaKalan = vault.balance();
    }

    /// Everything a wrong notice can be. Each flag is true when the call
    /// was REFUSED, which is the passing direction for all but the first.
    struct Kotu {
        bool dogruGecti;
        bool tekrarReddedildi;
        bool azImzaReddedildi;
        bool yabanciReddedildi;
        bool ciftImzaReddedildi;
        bool miktarDegisikReddedildi;
        bool tavanReddedildi;
    }

    /// @param dogru signatures over (burn-dogru, 0xB0B, pay)
    /// @param az fewer than the threshold, otherwise valid
    /// @param yabanci valid signatures from keys outside the set
    /// @param cift the same signer twice
    /// @param tavanUstu signatures over an amount above islemTavani
    function runKotuYollar(
        Kur calldata k,
        uint256 pay,
        uint256 tavanUstuPay,
        bytes[] calldata dogru,
        bytes[] calldata az,
        bytes[] calldata yabanci,
        bytes[] calldata cift,
        bytes[] calldata tavanUstu
    ) external returns (Kotu memory r) {
        (MockStock stock, StockVault vault,) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        stock.mintRaw(address(this), 1_000_000 ether);
        stock.approve(address(vault), type(uint256).max);
        vault.lock(1_000_000 ether, address(0xA11CE));

        bytes32 id1 = keccak256("burn-dogru");

        /* The amount the runner signed for, changed by the caller. If this
           succeeds the signature is not binding the amount, which was the
           whole defect. */
        try vault.release(id1, address(0xB0B), pay + 1, dogru) { r.miktarDegisikReddedildi = false; }
        catch { r.miktarDegisikReddedildi = true; }

        try vault.release(id1, address(0xB0B), pay, az) { r.azImzaReddedildi = false; }
        catch { r.azImzaReddedildi = true; }

        try vault.release(id1, address(0xB0B), pay, yabanci) { r.yabanciReddedildi = false; }
        catch { r.yabanciReddedildi = true; }

        try vault.release(id1, address(0xB0B), pay, cift) { r.ciftImzaReddedildi = false; }
        catch { r.ciftImzaReddedildi = true; }

        try vault.release(keccak256("burn-tavan"), address(0xB0B), tavanUstuPay, tavanUstu) {
            r.tavanReddedildi = false;
        } catch { r.tavanReddedildi = true; }

        /* Only now the correct one, so none of the refusals above could
           have been caused by the id already being spent. */
        try vault.release(id1, address(0xB0B), pay, dogru) { r.dogruGecti = true; }
        catch { r.dogruGecti = false; }

        try vault.release(id1, address(0xB0B), pay, dogru) { r.tekrarReddedildi = false; }
        catch { r.tekrarReddedildi = true; }
    }

    /// The window cap: two releases each under the per-transaction limit
    /// but together over the window's.
    function runPencere(
        Kur calldata k,
        uint256 pay,
        bytes[] calldata birinci,
        bytes[] calldata ikinci
    ) external returns (bool birinciGecti, bool ikinciReddedildi) {
        (MockStock stock, StockVault vault,) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        stock.mintRaw(address(this), 1_000_000 ether);
        stock.approve(address(vault), type(uint256).max);
        vault.lock(1_000_000 ether, address(0xA11CE));

        try vault.release(keccak256("p1"), address(0xB0B), pay, birinci) { birinciGecti = true; }
        catch { birinciGecti = false; }
        try vault.release(keccak256("p2"), address(0xB0B), pay, ikinci) { ikinciReddedildi = false; }
        catch { ikinciReddedildi = true; }
    }

    /// The wrapped side: a signed mint works, the same lock twice does not.
    function runMint(Kur calldata k, uint256 pay, bytes[] calldata imzalar)
        external returns (bool ilkGecti, bool ikinciReddedildi, uint256 arz)
    {
        (, , WrappedStock w) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        bytes32 id = keccak256("ayni-lock");
        try w.mint(id, address(0xA11CE), pay, imzalar) { ilkGecti = true; }
        catch { ilkGecti = false; }
        try w.mint(id, address(0xA11CE), pay, imzalar) { ikinciReddedildi = false; }
        catch { ikinciReddedildi = true; }
        arz = w.totalSupply();
    }

    /// The caps have to be impossible to switch off by accident.
    ///
    /// A zero window disabled the window total silently: the reset test
    /// block.timestamp >= pencereBasi + 0 is always true, so the running
    /// sum cleared on every notice and two events in one block each got
    /// the full allowance. It failed OPEN and it shipped in the first
    /// version of KopruKanit. The other three are incoherent rather than
    /// dangerous, but a bridge that reverts on every withdrawal should say
    /// so at deployment and not at the first withdrawal.
    struct KotuKurulum {
        bool sifirPencereRed;
        bool sifirIslemTavaniRed;
        bool sifirPencereTavaniRed;
        bool kucukPencereTavaniRed;
        bool esikBirRed;
        bool saglamGecti;
    }

    function runKotuKurulum(address[] calldata imzacilar)
        external returns (KotuKurulum memory r)
    {
        MockStock stock = new MockStock();
        IStock st = IStock(address(stock));

        try new StockVault(st, imzacilar, 2, 1, 100 ether, 0, 150 ether) {
            r.sifirPencereRed = false;
        } catch { r.sifirPencereRed = true; }

        try new StockVault(st, imzacilar, 2, 1, 0, 3600, 150 ether) {
            r.sifirIslemTavaniRed = false;
        } catch { r.sifirIslemTavaniRed = true; }

        try new StockVault(st, imzacilar, 2, 1, 100 ether, 3600, 0) {
            r.sifirPencereTavaniRed = false;
        } catch { r.sifirPencereTavaniRed = true; }

        /* A window total under the per-transaction cap: the bigger limit
           could never be reached, so one of the two is not what the
           deployer thought. */
        try new StockVault(st, imzacilar, 2, 1, 100 ether, 3600, 50 ether) {
            r.kucukPencereTavaniRed = false;
        } catch { r.kucukPencereTavaniRed = true; }

        /* A threshold of one is the defect being fixed. */
        try new StockVault(st, imzacilar, 1, 1, 100 ether, 3600, 150 ether) {
            r.esikBirRed = false;
        } catch { r.esikBirRed = true; }

        /* And a sane set still deploys, so the refusals above are the
           checks and not something broken in the constructor. */
        try new StockVault(st, imzacilar, 2, 1, 100 ether, 3600, 150 ether) {
            r.saglamGecti = true;
        } catch { r.saglamGecti = false; }
    }

    /// Burn must reduce supply and produce a unique id each time. Needs a
    /// signed mint first to have anything to burn.
    function runYakma(Kur calldata k, uint256 pay, bytes[] calldata imzalar)
        external returns (uint256 arzSonra, bytes32 id1, bytes32 id2)
    {
        (, , WrappedStock w) =
            _kur(k.imzacilar, k.esik, k.kaynakZincir, k.islemTavani, k.pencere, k.pencereTavani);
        w.mint(keccak256("l1"), address(this), pay, imzalar);
        id1 = w.burn(10 ether, address(0xB0B));
        id2 = w.burn(10 ether, address(0xB0B));
        arzSonra = w.totalSupply();
    }
}
