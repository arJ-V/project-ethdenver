const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadManifest() {
  const manifestPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing docs/deployed-addresses.json");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

async function main() {
  const [operator] = await hre.ethers.getSigners();
  const manifest = loadManifest();
  const vaultAddress = manifest?.adi?.vaultAddress;
  if (!vaultAddress) {
    throw new Error("ADI vault address missing in manifest.");
  }

  const vault = await hre.ethers.getContractAt("ADIAssetVault", vaultAddress);

  const mintTx = await vault.mintAsset(operator.address);
  const mintReceipt = await mintTx.wait();

  // asset ids are sequential and next starts at 1, so emitted AssetMinted gives current id.
  const parsed = mintReceipt.logs
    .map((log) => {
      try {
        return vault.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "AssetMinted");

  const assetId = parsed?.args?.assetId;
  if (!assetId) throw new Error("Could not parse AssetMinted event.");

  const lockTx = await vault.lockAsset(assetId, 50_000n, operator.address);
  const lockReceipt = await lockTx.wait();

  console.log("vault:", vaultAddress);
  console.log("mintTx:", mintTx.hash, "assetId:", assetId.toString());
  console.log("lockTx:", lockTx.hash, "block:", lockReceipt.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
