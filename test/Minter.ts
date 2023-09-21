import { expect } from "chai";
import { ethers } from "hardhat";
import { Stablecoin, Minter } from "../typechain-types";

describe("Minter", function () {

  async function initialize() {
    const [deployer, admin, user, wallet, other ] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("OwnedProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(admin);

    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const stablecoin = await Stablecoin.deploy();

    const StablecoinProxy = await ethers.getContractFactory("StablecoinProxy");
    const stablecoinProxy = await Stablecoin.attach(await StablecoinProxy.deploy(stablecoin, proxyAdmin, admin)) as Stablecoin;

    const Minter = await ethers.getContractFactory("Minter");
    const minter = await Minter.deploy();

    const MinterProxy = await ethers.getContractFactory("MinterProxy");
    const minterProxy = await Minter.attach(await MinterProxy.deploy(minter, proxyAdmin, admin, stablecoinProxy)) as Minter;

    await stablecoinProxy.connect(admin).grantRole(await stablecoinProxy.MINTER_ROLE(), minterProxy.target);
    await minterProxy.connect(admin).grantRole(await minterProxy.USER_ROLE(), user);

    return { deployer, stablecoin, stablecoinProxy, minter, minterProxy, admin, user, wallet, other };
  }

  it('non-granted user cannot mint or burn', async function () {
    const { minterProxy, user, other, wallet } = await initialize();
    for (const beneficiary of [wallet, user, other]) {
      await expect(minterProxy.connect(other).mint(beneficiary.address, 1000)).to.be.revertedWith(`AccessControl: account ${other.address.toLowerCase()} is missing role 0x14823911f2da1b49f045a0929a60b8c1f2a7fc8c06c7284ca3e8ab4e193a08c8`);
      await expect(minterProxy.connect(other).burn(beneficiary.address, 1000)).to.be.revertedWith(`AccessControl: account ${other.address.toLowerCase()} is missing role 0x14823911f2da1b49f045a0929a60b8c1f2a7fc8c06c7284ca3e8ab4e193a08c8`);
    }
  });

  it('non-admin cannot grant user role', async function () {
    const { minterProxy, user, other } = await initialize();
    for (const account of [user, other]) {
      await expect(minterProxy.connect(account).grantRole(await minterProxy.USER_ROLE(), account)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    }
  });

  it('user cannot mint or burn to non-whitelisted address', async function () {
    const { minterProxy, user, wallet } = await initialize();
    await expect(minterProxy.connect(user).mint(wallet.address, 1000)).to.be.revertedWith('Address not whitelisted');
    await expect(minterProxy.connect(user).burn(wallet.address, 1000)).to.be.revertedWith('Address not whitelisted');
  });

  it('non-admin cannot whitelist', async function () {
    const { admin, minterProxy, user, other, wallet } = await initialize();
    for (const account of [user, other]) {
      for (const beneficiary of [wallet, user, other]) {
        await expect(minterProxy.connect(account).whitelist(beneficiary)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
      }
    }
  });

  it('granted user can mint and burn to whitelisted address', async function () {
    const { admin, stablecoinProxy, minterProxy, user, wallet } = await initialize();
    await minterProxy.connect(admin).grantRole(await minterProxy.USER_ROLE(), user);
    await minterProxy.connect(admin).whitelist(wallet.address);
    await minterProxy.connect(user).mint(wallet.address, 1000);
    expect(await stablecoinProxy.balanceOf(wallet.address)).to.equal(1000);
    await minterProxy.connect(user).burn(wallet.address, 200);
    expect(await stablecoinProxy.balanceOf(wallet.address)).to.equal(800);
  });

});
