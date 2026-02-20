const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function writeManifest(data) {
  const outPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  const merged = { ...existing, ...data };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error("Deployer has zero balance on ADI network. Fund this address before deploy.");
  }

  const Vault = await hre.ethers.getContractFactory("ADIAssetVault");
  const vault = await Vault.deploy(deployer.address);
  await vault.waitForDeployment();
  const deployTx = vault.deploymentTransaction();
  const receipt = await deployTx.wait();

  console.log("ADIAssetVault deployed:", vault.target);
  console.log("deployer:", deployer.address);
  console.log("txHash:", receipt.hash);

  writeManifest({
    adi: {
      network: hre.network.name,
      chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
      deployer: deployer.address,
      vaultAddress: vault.target,
      vaultDeployTx: receipt.hash
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
