const hre = require("hardhat");

async function main() {
  const [admin, operator, beneficiary] = await hre.ethers.getSigners();
  const Vault = await hre.ethers.getContractFactory("ADIAssetVault");
  const vault = await Vault.deploy(admin.address);
  await vault.waitForDeployment();

  await (await vault.mintAsset(operator.address)).wait();
  await (
    await vault.lockAsset(1n, 50_000_000n, beneficiary.address)
  ).wait();

  console.log("ADIAssetVault:", vault.target);
  console.log("Asset 1 locked; bridge events emitted.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
