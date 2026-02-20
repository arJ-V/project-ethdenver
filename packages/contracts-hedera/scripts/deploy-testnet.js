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
    throw new Error("Deployer has zero balance on Hedera network. Fund this account before deploy.");
  }

  const Token = await hre.ethers.getContractFactory("ySolarToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenTx = await token.deploymentTransaction().wait();

  const Oracle = await hre.ethers.getContractFactory("YieldOracle");
  const oracle = await Oracle.deploy(deployer.address);
  await oracle.waitForDeployment();
  const oracleTx = await oracle.deploymentTransaction().wait();

  const Desk = await hre.ethers.getContractFactory("HederaOptionsDesk");
  const desk = await Desk.deploy(deployer.address, token.target, oracle.target);
  await desk.waitForDeployment();
  const deskTx = await desk.deploymentTransaction().wait();

  // Keep relayer operations simple: deployer key acts as minter and oracle admin.
  const minterRole = await token.MINTER_ROLE();
  const adminOracleRole = await oracle.ADMIN_ORACLE_ROLE();

  const hasMinter = await token.hasRole(minterRole, deployer.address);
  const hasOracleAdmin = await oracle.hasRole(adminOracleRole, deployer.address);

  console.log("ySolarToken deployed:", token.target, "tx:", tokenTx.hash);
  console.log("YieldOracle deployed:", oracle.target, "tx:", oracleTx.hash);
  console.log("HederaOptionsDesk deployed:", desk.target, "tx:", deskTx.hash);
  console.log("deployer:", deployer.address);
  console.log("roles:", { hasMinter, hasOracleAdmin });

  writeManifest({
    hedera: {
      network: hre.network.name,
      chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
      deployer: deployer.address,
      ySolarAddress: token.target,
      ySolarDeployTx: tokenTx.hash,
      oracleAddress: oracle.target,
      oracleDeployTx: oracleTx.hash,
      optionsDeskAddress: desk.target,
      optionsDeskDeployTx: deskTx.hash
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
