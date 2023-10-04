import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Stablecoin, Wallet } from "../typechain-types";
import { TransferStructOutput } from "../typechain-types/contracts/Wallet";

describe("Wallet", function () {
  async function initialize() {
    const [deployer, admin, minter, user, beneficiary1, beneficiary2, other] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("OwnedProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(admin);

    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const stablecoin = await Stablecoin.deploy();

    const StablecoinProxy = await ethers.getContractFactory("StablecoinProxy");
    const stablecoinProxy = await Stablecoin.attach(await StablecoinProxy.deploy(stablecoin, proxyAdmin, admin)) as Stablecoin;

    const Wallet = await ethers.getContractFactory("Wallet");
    const wallet = await Wallet.deploy();

    const WalletProxy = await ethers.getContractFactory("WalletProxy");
    const walletProxy = await Wallet.attach(await WalletProxy.deploy(wallet, proxyAdmin, admin, stablecoinProxy)) as Wallet;
    
    await walletProxy.connect(admin).grantRole(await walletProxy.TRANSFER_ROLE(), user);
    await walletProxy.connect(admin).grantRole(await walletProxy.MINT_ROLE(), minter);
    await stablecoinProxy.connect(admin)["mint(address,uint256)"](walletProxy, 10000);
    await stablecoinProxy.connect(admin).grantRole(await stablecoinProxy.MINT_ROLE(), walletProxy);
    
    return { wallet, walletProxy, stablecoin, stablecoinProxy, deployer, admin, minter, user, beneficiary: beneficiary1, beneficiary1, beneficiary2, other };
  }

  it('non-granted minter cannot mint or burn', async function () {
    const { deployer, walletProxy, user, other } = await initialize();
    for (const account of [user, other, deployer]) {
      await expect(walletProxy.connect(account).mint(1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686`);
      await expect(walletProxy.connect(account).burn(1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686`);
    }
  });

  it('granted minter can mint and burn', async function () {
    const { stablecoinProxy, walletProxy, minter } = await initialize();
    await walletProxy.connect(minter).mint(1000);
    expect(await stablecoinProxy.balanceOf(walletProxy)).to.equal(11000);
    await walletProxy.connect(minter).burn(200);
    expect(await stablecoinProxy.balanceOf(walletProxy)).to.equal(10800);
  });

  it('non-granted user cannot transfer', async function () {
    const { deployer, walletProxy, minter, beneficiary1, beneficiary2, other } = await initialize();
    for (const account of [minter, other, deployer]) {
      for (const beneficiary of [other, beneficiary1, beneficiary2]) {
        await expect(walletProxy.connect(account)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x8502233096d909befbda0999bb8ea2f3a6be3c138b9fbf003752a4c8bce86f6c`);
      }
    }
  });

  it('non-admin cannot grant transfer role', async function () {
    const { deployer, user, walletProxy, other } = await initialize();
    for (const account of [deployer, user, other]) {
      await expect(walletProxy.connect(account).grantRole(await walletProxy.TRANSFER_ROLE(), account)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    }
  });

  it('cannot transfer above daily wallet limit', async function () {
    const { admin, user, walletProxy, beneficiary1, beneficiary2, other } = await initialize();
    for (const account of [admin, user]) {
      for (const beneficiary of [beneficiary1, beneficiary2]) {
        await expect(walletProxy.connect(account)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith('Limit exceeded');
      }
    }
  });

  it('non-admin cannot set limit', async function () {
    const { deployer, user, walletProxy, other } = await initialize();
    for (const account of [deployer, user, other]) {
      await expect(walletProxy.connect(account).setLimit(6000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x2f619476c2bfb911943ba3beab8e9180f8e9415abd4ddb126a14f02a517aa5b5`);
    }
  });

  it('admin can set limit', async function () {
    const { admin, walletProxy } = await initialize();
    await walletProxy.connect(admin).setLimit(6000);
    expect(await walletProxy.getLimit()).to.equal(6000);
  });

  it('cannot transfer to non-whitelisted beneficiary', async function () {
    const { admin, user, walletProxy, beneficiary1, beneficiary2, other } = await initialize();
    await walletProxy.connect(admin).setLimit(6000);
    for (const beneficiary of [beneficiary1, beneficiary2, other]) {
      await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith('Beneficiary does not exist');
    }
  });

  it('non-admin cannot add beneficiary', async function () {
    const { deployer, user, walletProxy, beneficiary1, beneficiary2, other } = await initialize();
    for (const account of [deployer, user, other]) {
      for (const beneficiary of [beneficiary1, beneficiary2]) {
        await expect(walletProxy.connect(account)["addBeneficiary(address)"](beneficiary)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x3ba3d5ae8cb964013f658648156b28b2b473641d4c80ed56092d0fa57f9eef2e`);
        await expect(walletProxy.connect(account)["addBeneficiary(address,uint256)"](beneficiary, 1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x3ba3d5ae8cb964013f658648156b28b2b473641d4c80ed56092d0fa57f9eef2e`);
        await expect(walletProxy.connect(account)["addBeneficiary(address,uint256,uint256)"](beneficiary, 1000, 1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x3ba3d5ae8cb964013f658648156b28b2b473641d4c80ed56092d0fa57f9eef2e`);
      }
    }
  });

  it('admin can add beneficiary', async function () {
    const { admin, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin)["addBeneficiary(address)"](beneficiary);
    expect(await walletProxy.getBeneficiaryLimit(beneficiary)).to.equal(0);
    expect(await walletProxy.getBeneficiaryEnabledAt(beneficiary)).to.equal(await time.latest() + 24 * 3600);
  });

  it('admin can add beneficiary (with limit)', async function () {
    const { admin, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin)["addBeneficiary(address,uint256)"](beneficiary, 1000);
    expect(await walletProxy.getBeneficiaryLimit(beneficiary)).to.equal(1000);
    expect(await walletProxy.getBeneficiaryEnabledAt(beneficiary)).to.equal(await time.latest() + 24 * 3600);
  });

  it('admin can add beneficiary (with limit and cooldown)', async function () {
    const { admin, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin)["addBeneficiary(address,uint256,uint256)"](beneficiary, 1000, 3600);
    expect(await walletProxy.getBeneficiaryLimit(beneficiary)).to.equal(1000);
    expect(await walletProxy.getBeneficiaryEnabledAt(beneficiary)).to.equal(await time.latest() + 3600);
  });

  it('cannot transfer before cooldown', async function () {
    const { admin, user, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin).setLimit(6000);
    await walletProxy.connect(admin)["addBeneficiary(address)"](beneficiary);
    await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith('Beneficiary is not enabled');
    await time.increase(3600 * 23);
    await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith('Beneficiary is not enabled');
  });

  it('cannot transfer above daily beneficiary limit', async function () {
    const { admin, user, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin).setLimit(6000);
    await walletProxy.connect(admin)["addBeneficiary(address)"](beneficiary);
    await time.increase(3600 * 24);
    await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiary, 1000)).to.be.revertedWith('Beneficiary limit exceeded');
  });

  it('non-admin cannot set beneficiary limit', async function () {
    const { deployer, user, walletProxy, beneficiary1, beneficiary2, other } = await initialize();
    for (const account of [deployer, user, other]) {
      for (const beneficiary of [beneficiary1, beneficiary2]) {
        await expect(walletProxy.connect(account).setBeneficiaryLimit(beneficiary, 2000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x94696073f4b1cfc25212d9f5f2d64a2f7323955ab6eded2c8aa4965446edacbf`);
      }
    }
  });

  it('admin cannot set beneficiary limit of non-whitelisted beneficiary', async function () {
    const { admin, walletProxy, beneficiary } = await initialize();
    await expect(walletProxy.connect(admin).setBeneficiaryLimit(beneficiary, 2000)).to.be.revertedWith('Beneficiary does not exist');
  });

  it('admin can set beneficiary limit', async function () {
    const { admin, walletProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin)["addBeneficiary(address)"](beneficiary)
    await walletProxy.connect(admin).setBeneficiaryLimit(beneficiary, 2000);
    expect(await walletProxy.getBeneficiaryLimit(beneficiary)).to.equal(2000);
  });

  it('user can transfer', async function () {
    const { admin, user, beneficiary1, beneficiary2, walletProxy, stablecoinProxy } = await initialize();
    const transferCounter = new TransferCounter<'beneficiary1' | 'beneficiary2'>();
    const beneficiaries = { beneficiary1: beneficiary1, beneficiary2: beneficiary2 }; 
    const sendSuccessfullTransfer = async (beneficiary: 'beneficiary1' | 'beneficiary2', amount: number) => {
      await walletProxy.connect(user)["transfer(address,uint256)"](beneficiaries[beneficiary], amount);
      await transferCounter.addBeneficiaryTransfer(beneficiary, amount);
      transferCounter.checkTransfers(await walletProxy.getTransfers());
      transferCounter.checkBeneficiaryTransfers(beneficiary, await walletProxy.getBeneficiaryTransfers(beneficiaries[beneficiary]));
    }
    const sendFailedWalletTransfer = async (beneficiary: 'beneficiary1' | 'beneficiary2', amount: number) => {
      await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiaries[beneficiary], amount)).to.be.revertedWith('Limit exceeded');
    };
    const sendFailedBeneficiaryTransfer = async (beneficiary: 'beneficiary1' | 'beneficiary2', amount: number) => {
      await expect(walletProxy.connect(user)["transfer(address,uint256)"](beneficiaries[beneficiary], amount)).to.be.revertedWith('Beneficiary limit exceeded');
    };
    await walletProxy.connect(admin).setLimit(2000);
    await walletProxy.connect(admin)["addBeneficiary(address,uint256)"](beneficiary1, 1000);
    await walletProxy.connect(admin)["addBeneficiary(address,uint256)"](beneficiary2, 3000);
    await time.increase(3600 * 24);
    await sendSuccessfullTransfer('beneficiary1', 500);
    await time.increase(3600 * 2);
    await sendFailedBeneficiaryTransfer('beneficiary1', 501);
    await sendSuccessfullTransfer('beneficiary1', 500);
    await time.increase(3600 * 2);
    await sendFailedBeneficiaryTransfer('beneficiary1', 1);
    await time.increase(3600 * 20);
    await sendFailedBeneficiaryTransfer('beneficiary1', 501);
    await sendSuccessfullTransfer('beneficiary1', 500);
    await time.increase(3600 * 1);
    await sendFailedBeneficiaryTransfer('beneficiary1', 1);
    await time.increase(3600 * 1);
    await sendFailedBeneficiaryTransfer('beneficiary1', 501);
    await sendSuccessfullTransfer('beneficiary1', 200);
    await time.increase(3600 * 1);
    await sendSuccessfullTransfer('beneficiary1', 300);
    await time.increase(3600 * 21);
    await sendFailedBeneficiaryTransfer('beneficiary1', 501);
    await sendSuccessfullTransfer('beneficiary1', 500);
    await time.increase(3600 * 2);
    await sendFailedBeneficiaryTransfer('beneficiary1', 201);
    await sendSuccessfullTransfer('beneficiary1', 200);
    await sendFailedBeneficiaryTransfer('beneficiary1', 1);
    await sendFailedWalletTransfer('beneficiary2', 1001);
    await sendSuccessfullTransfer('beneficiary2', 1000);
    await sendFailedWalletTransfer('beneficiary2', 1);
    await walletProxy.connect(admin).temporarilyIncreaseLimit(1000);
    await transferCounter.addTransfer(-1000);
    await sendSuccessfullTransfer('beneficiary2', 1000);
    await sendFailedWalletTransfer('beneficiary2', 1);
    await time.increase(3600 * 24);
    await sendSuccessfullTransfer('beneficiary2', 2000);
    await sendFailedWalletTransfer('beneficiary2', 1);
  });
  
  it('non-admin cannot transfer arbitrary coins', async function () {
    const { deployer, user, walletProxy, stablecoinProxy, beneficiary, other } = await initialize();
    for (const account of [deployer, user, other]) {
      await expect(walletProxy.connect(account)["transfer(address,address,uint256)"](stablecoinProxy, beneficiary, 1000)).to.be.revertedWith(`AccessControl: account ${account.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);      
    }
  });

  it('admin can transfer arbitrary coins', async function () {
    const { admin, walletProxy, stablecoinProxy, beneficiary } = await initialize();
    await walletProxy.connect(admin)["transfer(address,address,uint256)"](stablecoinProxy, beneficiary, 1000);
    expect(await stablecoinProxy.balanceOf(beneficiary)).to.equal(1000);      
  });

});

class TransferCounter<T extends string> {

  readonly #transfers: {amount: number, time: number}[] = [];
  readonly #beneficiaryTransfers: {[key in T]?: {amount: number, time: number}[]} = {};
  
  async #filter(transfers: {amount: number, time: number}[]) {
    while (transfers.length > 0) {
      if (transfers[0].time <= await time.latest() - 24 * 3600) {
        transfers.splice(0, 1);
      } else {
        break;
      }
    }
  }

  #check(transfers: TransferStructOutput[], reference: {amount: number, time: number}[]) {
    expect(transfers.length).to.equal(reference.length);
    for (let i = 0; i < transfers.length; i++) {
      expect(transfers[i][0]).to.equal(reference[i].amount);
      expect(transfers[i][1]).to.equal(reference[i].time);
    }
  }

  async addTransfer(amount: number) {
    this.#transfers.push({amount, time: await time.latest()});
    await this.#filter(this.#transfers);
  }

  async addBeneficiaryTransfer(beneficiary: T, amount: number) {
    await this.addTransfer(amount);
    let beneficiaryTransfers = this.#beneficiaryTransfers[beneficiary]
    if (!beneficiaryTransfers) {
      beneficiaryTransfers = [];
      this.#beneficiaryTransfers[beneficiary] = beneficiaryTransfers;
    }
    beneficiaryTransfers.push({amount, time: await time.latest()});
    await this.#filter(beneficiaryTransfers);
  }

  checkBeneficiaryTransfers(beneficiary: T, transfers: TransferStructOutput[]) {
    this.#check(transfers, this.#beneficiaryTransfers[beneficiary] ?? [])
  }

  checkTransfers(transfers: TransferStructOutput[]) {
    this.#check(transfers, this.#transfers);
  }
}