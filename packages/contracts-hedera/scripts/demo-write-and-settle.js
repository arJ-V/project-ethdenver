const hre = require("hardhat");

async function main() {
  const [admin, writer, buyer] = await hre.ethers.getSigners();

  const Oracle = await hre.ethers.getContractFactory("YieldOracle");
  const oracle = await Oracle.deploy(admin.address);
  await oracle.waitForDeployment();

  const Token = await hre.ethers.getContractFactory("ySolarToken");
  const token = await Token.deploy(admin.address);
  await token.waitForDeployment();

  const Desk = await hre.ethers.getContractFactory("HederaOptionsDesk");
  const desk = await Desk.deploy(admin.address, token.target, oracle.target);
  await desk.waitForDeployment();

  await (await token.mint(writer.address, 10_000n)).wait();
  await (await token.connect(writer).approve(desk.target, 10_000n)).wait();

  const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
  const expiry = BigInt(now + 200);
  await (await desk.connect(writer).writeOption(buyer.address, 1_000n, 500n, expiry)).wait();
  console.log("Option written with expiry:", expiry.toString());

  await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(expiry + 1n)]);
  await hre.network.provider.send("evm_mine");

  await (await oracle.pushYieldIndex(700n)).wait();
  await (await desk.executeScheduledSettlement(1n)).wait();

  const buyerBalance = await token.balanceOf(buyer.address);
  console.log("Buyer ySOLAR balance:", buyerBalance.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
