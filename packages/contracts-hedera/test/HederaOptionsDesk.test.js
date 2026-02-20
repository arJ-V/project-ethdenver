const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("HederaOptionsDesk", function () {
  async function deployFixture() {
    const [admin, writer, buyer, other] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("YieldOracle");
    const oracle = await Oracle.deploy(admin.address);
    await oracle.waitForDeployment();

    const Token = await ethers.getContractFactory("ySolarToken");
    const token = await Token.deploy(admin.address);
    await token.waitForDeployment();

    const Desk = await ethers.getContractFactory("HederaOptionsDesk");
    const desk = await Desk.deploy(admin.address, token.target, oracle.target);
    await desk.waitForDeployment();

    await token.mint(writer.address, 1_000_000n);
    await token.connect(writer).approve(desk.target, 1_000_000n);

    return { oracle, token, desk, admin, writer, buyer, other };
  }

  async function writeDefaultOption(f) {
    const now = await time.latest();
    const expiry = BigInt(now + 200);
    await f.desk.connect(f.writer).writeOption(f.buyer.address, 1000n, 500n, expiry);
    return { expiry };
  }

  it("writes option successfully", async function () {
    const f = await deployFixture();
    const { expiry } = await writeDefaultOption(f);
    const op = await f.desk.options(1n);
    expect(op.writer).to.equal(f.writer.address);
    expect(op.buyer).to.equal(f.buyer.address);
    expect(op.expiry).to.equal(expiry);
  });

  it("fails with insufficient collateral", async function () {
    const f = await deployFixture();
    const now = await time.latest();
    const expiry = BigInt(now + 200);
    await expect(
      f.desk.connect(f.buyer).writeOption(f.writer.address, 1n, 500n, expiry)
    ).to.be.reverted;
  });

  it("fails when expiry is too short", async function () {
    const f = await deployFixture();
    const now = await time.latest();
    const expiry = BigInt(now + 120);
    await expect(
      f.desk.connect(f.writer).writeOption(f.buyer.address, 1000n, 500n, expiry)
    ).to.be.revertedWithCustomError(f.desk, "InvalidExpiry");
  });

  it("rejects direct unauthorized settlement call", async function () {
    const f = await deployFixture();
    await writeDefaultOption(f);
    await expect(f.desk.connect(f.other).settleOption(1n)).to.be.revertedWithCustomError(
      f.desk,
      "UnauthorizedSettler"
    );
  });

  it("transfers locked collateral to buyer for ITM settlement", async function () {
    const f = await deployFixture();
    const { expiry } = await writeDefaultOption(f);
    await time.increaseTo(expiry + 1n);
    await f.oracle.pushYieldIndex(700n);

    await expect(f.desk.executeScheduledSettlement(1n)).to.emit(f.desk, "OptionSettled");
    expect(await f.token.balanceOf(f.buyer.address)).to.equal(1000n);
  });

  it("releases collateral back to writer for OTM settlement", async function () {
    const f = await deployFixture();
    const { expiry } = await writeDefaultOption(f);
    await time.increaseTo(expiry + 1n);
    await f.oracle.pushYieldIndex(200n);

    await expect(f.desk.executeScheduledSettlement(1n)).to.emit(f.desk, "CollateralReleased");
    expect(await f.token.balanceOf(f.writer.address)).to.equal(1_000_000n);
  });

  it("emits slashing event on partial collateral path", async function () {
    const f = await deployFixture();
    const now = await time.latest();
    const expiry = BigInt(now + 200);
    await f.desk.connect(f.writer).writeOption(f.buyer.address, 5_000n, 500n, expiry);

    await f.token.connect(f.admin).burn(f.desk.target, 4_500n);
    await time.increaseTo(expiry + 1n);
    await f.oracle.pushYieldIndex(800n);

    await expect(f.desk.executeScheduledSettlement(1n))
      .to.emit(f.desk, "SettlementFailed")
      .and.to.emit(f.desk, "CollateralSlashed");
  });

  it("rejects stale oracle settlement data", async function () {
    const f = await deployFixture();
    const { expiry } = await writeDefaultOption(f);
    await f.oracle.pushYieldIndex(900n);
    await time.increaseTo(expiry + 700n);

    await expect(f.desk.executeScheduledSettlement(1n)).to.be.revertedWithCustomError(
      f.desk,
      "OracleStale"
    );
  });
});
