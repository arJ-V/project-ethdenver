const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadManifest() {
  const outPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  if (!fs.existsSync(outPath)) {
    throw new Error("Missing docs/deployed-addresses.json. Run full deploy first.");
  }
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
}

function writeManifest(data) {
  const outPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  const existing = loadManifest();
  const merged = { ...existing, ...data };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error("Deployer has zero balance on Hedera network. Fund this account before deploy.");
  }

  const manifest = loadManifest();
  const hedera = manifest.hedera;
  if (!hedera?.ySolarAddress || !hedera?.oracleAddress) {
    throw new Error("Manifest missing ySolarAddress or oracleAddress. Run full deploy first.");
  }

  console.log("Redeploying HederaOptionsDesk only (keeping existing ySolar and Oracle)");
  console.log("  ySolar:", hedera.ySolarAddress);
  console.log("  Oracle:", hedera.oracleAddress);

  const Desk = await hre.ethers.getContractFactory("HederaOptionsDesk");
  const desk = await Desk.deploy(deployer.address, hedera.ySolarAddress, hedera.oracleAddress);
  await desk.waitForDeployment();
  const deskTx = await desk.deploymentTransaction().wait();

  console.log("HederaOptionsDesk deployed:", desk.target, "tx:", deskTx.hash);

  writeManifest({
    hedera: {
      ...hedera,
      optionsDeskAddress: desk.target,
      optionsDeskDeployTx: deskTx.hash
    }
  });
  console.log("Updated docs/deployed-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
