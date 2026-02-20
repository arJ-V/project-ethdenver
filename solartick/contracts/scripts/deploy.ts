import hre, { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const SolarTelemetry = await ethers.getContractFactory("SolarTelemetry");
  const contract = await SolarTelemetry.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("SolarTelemetry deployed to:", address);

  // Export ABI to contracts/abi/SolarTelemetry.json
  const artifact = await hre.artifacts.readArtifact("SolarTelemetry");
  const abiPath = path.join(__dirname, "..", "abi", "SolarTelemetry.json");
  const abiDir = path.dirname(abiPath);
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
  console.log("ABI written to", abiPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
