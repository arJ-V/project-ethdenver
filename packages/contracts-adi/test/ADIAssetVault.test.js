const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ADIAssetVault", function () {
  async function deployFixture() {
    const [admin, user, beneficiary] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("ADIAssetVault");
    const vault = await Vault.deploy(admin.address);
    await vault.waitForDeployment();
    return { vault, admin, user, beneficiary };
  }

  it("mints and locks an asset, emitting bridge events", async function () {
    const { vault, user, beneficiary } = await deployFixture();
    await vault.mintAsset(user.address);

    await expect(vault.lockAsset(1n, 5000n, beneficiary.address))
      .to.emit(vault, "AssetLocked")
      .and.to.emit(vault, "YieldMintRequested");

    expect(await vault.ownerOf(1n)).to.equal(vault.target);
    expect(await vault.isAssetLocked(1n)).to.equal(true);
  });

  it("rejects duplicate lock attempts", async function () {
    const { vault, user, beneficiary } = await deployFixture();
    await vault.mintAsset(user.address);
    await vault.lockAsset(1n, 5000n, beneficiary.address);

    await expect(vault.lockAsset(1n, 5000n, beneficiary.address)).to.be.revertedWithCustomError(
      vault,
      "AssetAlreadyLocked"
    );
  });

  it("enforces admin role for lock", async function () {
    const { vault, user, beneficiary } = await deployFixture();
    await vault.mintAsset(user.address);

    await expect(vault.connect(user).lockAsset(1n, 5000n, beneficiary.address)).to.be.reverted;
  });

  it("blocks lock operations while paused", async function () {
    const { vault, user, beneficiary } = await deployFixture();
    await vault.mintAsset(user.address);
    await vault.pause();

    await expect(vault.lockAsset(1n, 5000n, beneficiary.address)).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause"
    );
  });
});
