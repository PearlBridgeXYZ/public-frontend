// Affected-wallet table for the May-2026 duplicate-payout incident.
//
// During a ~36h window, four WPRL→PRL burns received more PRL than the
// burn called for: a race in the relay's unlock path occasionally let
// two signing+broadcast attempts both succeed on a single burn (and once,
// three). The relay code path that allowed it is now fixed (CAS-guarded
// state transitions; v1.5.5). This file drives a one-time in-app banner
// asking each affected wallet to return the surplus.
//
// Keys are LOWERCASED EIP-55 burn-tx senders. Values are read-only and
// must not be tampered with after publication — these are the only
// wallets that will see the notice.
//
// Pearl chain UTXOs as of audit (2026-05-29):
//   - 0xc7c67… two extras (1 PRL each) still UNSPENT in user's wallet
//   - other three SPENT, but user/CEX may still cooperate on return

export const PEARL_RETURN_ADDRESS =
  "prl1p5f450a5540efskxv050tgscelscuztut6zfaqssq8vnlnw53wvdsmw4yvs";

export type DuplicatePayoutEntry = {
  // The lowercased ETH wallet that initiated the burn.
  ethAddress: string;
  // The eth tx hash of the burn that received duplicates.
  ethBurnTxHash: string;
  // The pearl address the surplus PRL was paid to.
  pearlRecipient: string;
  // Surplus PRL the user received above the entitled amount.
  surplusPrl: string;
  // Per-extra duplicate pearl txids (the EXTRAS, not the legitimate payout).
  duplicateTxids: string[];
  // Disposition snapshot at notice publication time.
  disposition: "unspent" | "spent";
};

export const DUPLICATE_PAYOUT_NOTICES: DuplicatePayoutEntry[] = [
  {
    ethAddress: "0xc7c67d9ed12361ead04d7a3fcfa1da5a0c3b3050",
    ethBurnTxHash:
      "0x0ce5d9a3c905cad52e8dbc7003ce9cd6dd302a639fef58f83a6549cc7ecadb6c",
    pearlRecipient:
      "prl1pudzerhgkw0d67ku7f8vkq2f4rq35p5c8n9fk6pa6tn8n8sks944qlpl9sr",
    surplusPrl: "2",
    duplicateTxids: [
      "32e9b9b91f9d856801c1c011ff42625458cdc120b5590f1af0a6fe0fbff0c093",
      "6b1bac29b0276feb3d8ed0c8314a42e3a852d63020245db4f36734e1684442f6",
    ],
    disposition: "unspent",
  },
  {
    ethAddress: "0xcd75ddbb98e638cc2c52b7f982ef608e1ee4a408",
    ethBurnTxHash:
      "0x2f80583d1204615279ff4dcd84ea7656ba0594a68e33675b1c3c2c2b13119255",
    pearlRecipient:
      "prl1pe27njwsuj6vuv9vett92t49fvsrftk325qz2dguccs2pc3vcqp0qsp7wgf",
    surplusPrl: "443.52505069",
    duplicateTxids: [
      "d944db5011788fdb0df325ece84873d0481da76bccd4928c7a6a1746ebef3ff6",
    ],
    disposition: "spent",
  },
  {
    ethAddress: "0xa2279e085c9709ad433edf8e8c5fa69e4b8f4f2d",
    ethBurnTxHash:
      "0x8237d9c67801a296f8c8ebfbe63c3ac396ab26bf59829fe70e01d4da35014fde",
    pearlRecipient:
      "prl1p2zu56gqek8ws9k9y40x7vvpj43x7anjysjfr4vd000jfjkufdqash09tu2",
    surplusPrl: "441.90",
    duplicateTxids: [
      "9bc8763a0dce57fca9372f8c0afba3c85ae3c32027fab437a4a1e394e1617b0d",
    ],
    disposition: "spent",
  },
  {
    ethAddress: "0x80a6ff03914e6e8067c20e17a014f8b50f335c64",
    ethBurnTxHash:
      "0x5ea6bf066c8520bd2b7f48b4658447fa5d16ea541fd8f9488c9a6de030aa5291",
    pearlRecipient:
      "prl1peeq0s7zufusjn3mutcpw9lct5vwpncavqg0khy98tc2jq3qm52hslvhmyr",
    surplusPrl: "3000",
    duplicateTxids: [
      "a1ece0ae3fda8c1b2014ff4b30f8c7cbf2ddf61a548e6b6fbf4223a3b7a060cb",
    ],
    disposition: "spent",
  },
];

export function findDuplicatePayoutNotice(
  address: string | undefined,
): DuplicatePayoutEntry | undefined {
  if (!address) return undefined;
  const key = address.toLowerCase();
  return DUPLICATE_PAYOUT_NOTICES.find((e) => e.ethAddress === key);
}
