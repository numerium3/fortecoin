import hardhat, { ethers } from "hardhat";

type Address = string | {target: string | { getAddress(): Promise<string>;}};

async function getAddress(contract: Address) {
  return typeof contract === 'string' ? contract : typeof contract.target === 'string' ? contract.target : await contract.target.getAddress();
}

async function verify({address, path, name, constructorArguments, openzepplinContract}:{address: any, name: string, path?: string, constructorArguments?: Address[], openzepplinContract?: boolean}) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`Verifying ${name}...`, {
      address,
      contract: (openzepplinContract ?? false) ? undefined : `contracts/${path !== undefined ? path : ''}${name}.sol:${name}`,
      constructorArguments: await Promise.all((constructorArguments || [])?.map(async(constructorArgument) => {
        return await getAddress(constructorArgument);
      }))
    });
    try {
      await hardhat.run('verify:verify', {
        address,
        contract: (openzepplinContract ?? false) ? undefined : `contracts/${path !== undefined ? path : ''}${name}.sol:${name}`,
        constructorArguments: await Promise.all((constructorArguments || [])?.map(async(constructorArgument) => {
          return await getAddress(constructorArgument);
        }))
      });
      console.log(`${name} verified`);
      break;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name !== 'ContractVerificationMissingBytecodeError') {
          console.log(`Verification of ${name} failed: ${error.message}`);
          break;
        }
      } else {
        throw error;
      }
    }
  }
}

/*async function deploy(name: string, options?: {constructorArguments?: Address[], openzepplinContract?: boolean}) {
  const constructorArguments = options?.constructorArguments ?? [];
  const openzepplinContract = options?.openzepplinContract ?? false;
  console.log(`Deploying ${name}...`);
  const contract = await ethers.deployContract(name, constructorArguments);
  await contract.waitForDeployment();
  console.log(`${name} deployed to ${contract.target}`);
  (async () => {
    await verify({address: contract.target, name, constructorArguments, openzepplinContract});
  })();
  return contract;
}*/


//const safeProxyFactorySalt = 0x7b85129dbba46a1b3767e5c7877adeb3355e1abe43ce2e8ec25fc4f02c17f04an
//const safeProxyFactoryAddress = '0xFE9ad50Cf194030755C4Fe52f33eAdBbbE327aB3';

const factoryAddress = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';
const safeProxyFactoryAddress = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';

function getPayload({bytecode, factoryAddress, name, path, salt, constructorArguments, openzepplinContract}: {bytecode?: string, factoryAddress: string, name: string, path?: string, salt: bigint, constructorArguments?: {types: any[], values: Address[]}, openzepplinContract?: boolean}) {
  if (bytecode === undefined) {
    const { bytecode: bytecode2 } = require(`../artifacts/contracts/${path !== undefined ? path : ''}${name}.sol/${name}.json`);
    bytecode = bytecode2;
  }
  const initCode = bytecode + new ethers.AbiCoder().encode(constructorArguments?.types ?? [], constructorArguments?.values ?? []).slice(2);
  const saltHex = '0x' + salt.toString(16).padStart(64, "0");
  const data = saltHex + initCode.slice(2);
  const address = ethers.getCreate2Address(factoryAddress, saltHex, ethers.keccak256(initCode));
  console.log(`Deploying ${name} at ${address}`);
  return { name, path, to: factoryAddress, data, address, constructorArguments, openzepplinContract };
}

async function sendTransaction({to, data}: {to: string, data: string}) {
  const [account] = await ethers.getSigners();
  const tx = await account.sendTransaction({to, data});
  console.log('Submitted transaction', tx.hash);
  await tx.wait();
  console.log('Processed transaction', tx.hash);
  return tx;
}

async function deployPayload({address, name, path, to, data, constructorArguments, openzepplinContract, shouldVerify}: {address: string, name: string, path?: string, to: string, data: string, constructorArguments?: {types: any[], values: Address[]}, openzepplinContract?: boolean, shouldVerify?: boolean}) {
  await sendTransaction({to, data});
  if (shouldVerify === true) {
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 300*1000));
      await verify({address, path, name, constructorArguments: constructorArguments?.values, openzepplinContract });
    })();
  }
  return address;
}

async function deployContract({name, path, salt, constructorArguments, openzepplinContract}: {name: string, path?: string, salt: bigint, constructorArguments?: {types: any[], values: Address[]}, openzepplinContract?: boolean}) {
  const payload = getPayload({factoryAddress, name, path, salt, constructorArguments, openzepplinContract});
  return await deployPayload(payload);
}

function getSafeProxyPayload({salt, singleton, owners, threshold, fallbackHandler}: {salt: bigint, singleton?: string, owners: string[], threshold: number, fallbackHandler?: string}) {
  if (singleton === undefined) {
    singleton = '0x3e5c63644e683549055b9be8653de26e0b4cd36e';
  }
  if (fallbackHandler === undefined) {
    fallbackHandler = '0xf48f2b2d2a534e402487b3ee7c18c33aec0fe5e4';
  }
  const bytecode = '0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033';
  const {address} = getPayload({factoryAddress: safeProxyFactoryAddress, path: 'safe/',  name: 'SafeProxy', salt, bytecode });
  const iface = new ethers.Interface([ "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)" ]);
  const initializerData = iface.encodeFunctionData("setup", [ owners, threshold, "0x0000000000000000000000000000000000000000", "0x", fallbackHandler, "0x0000000000000000000000000000000000000000", 0, "0x0000000000000000000000000000000000000000"]);
  const iface2 = new ethers.Interface([ "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce)" ]);
  const data = iface2.encodeFunctionData("createProxyWithNonce", [ singleton, initializerData, salt ]);
  return { name: 'SafeProxy', path: "safe/", to: safeProxyFactoryAddress, data, address };

}

function getProxyAdminPayload({salt, adminAddress}: {salt: bigint, adminAddress: string}) {
  return getPayload({factoryAddress, name: 'OwnedProxyAdmin', salt, constructorArguments: {types: ["address"], values: [adminAddress] }});
}

function getStablecoinPayload({salt}: {salt: bigint}) {
  return getPayload({factoryAddress, name: 'Stablecoin', salt });
}

function getStablecoinProxyPayload({salt, stablecoinAddress, adminAddress, proxyAdminAddress}: {salt: bigint, stablecoinAddress: string, adminAddress: string, proxyAdminAddress: string}) {
  return getPayload({factoryAddress, name: 'StablecoinProxy', salt, constructorArguments: {types: ["address", "address", "address"], values: [stablecoinAddress, proxyAdminAddress, adminAddress]} });
}

function getWalletPayload({salt}: {salt: bigint}) {
  return getPayload({factoryAddress, name: 'Wallet', salt });
}

function getWalletProxyPayload({salt, walletAddress, adminAddress, proxyAdminAddress, stablecoinProxyAddress}: {salt: bigint, walletAddress: string, adminAddress: string, proxyAdminAddress: string, stablecoinProxyAddress: string}) {
  return getPayload({factoryAddress, name: 'WalletProxy', salt, constructorArguments: {types: ["address", "address", "address", "address"], values: [walletAddress, proxyAdminAddress, adminAddress, stablecoinProxyAddress]} });
}

async function deployPayloads(payloads: {address: string, name: string, data: string, constructorArguments?: {types: any[], values: Address[]}, openzepplinContract?: boolean}[]) {
  const iface = new ethers.Interface([ "function aggregate(tuple(address target, bytes callData)[] calldata calls)" ]);
  const data = iface.encodeFunctionData("aggregate", [ payloads.map(({data}) => [factoryAddress, data])  ])
  await sendTransaction({to: multicallAddress, data});
  await new Promise((resolve) => setTimeout(resolve, 300*1000));
  for (const {address, name, constructorArguments, openzepplinContract} of payloads) {
    await verify({address, name, constructorArguments: constructorArguments?.values, openzepplinContract });
  }
}

async function deployContracts({salt, adminAddress}: {salt: bigint, adminAddress: string}) {
  const proxyAdmin = getProxyAdminPayload({salt: salt, adminAddress});
  const stablecoin = getStablecoinPayload({salt: salt});
  const stablecoinProxy = getStablecoinProxyPayload({salt: salt, stablecoinAddress: stablecoin.address, adminAddress, proxyAdminAddress: proxyAdmin.address});
  const wallet = getWalletPayload({salt: salt});
  const walletProxy = getWalletProxyPayload({salt: salt, walletAddress: wallet.address, stablecoinProxyAddress: stablecoinProxy.address, adminAddress, proxyAdminAddress: proxyAdmin.address});
  await deployPayloads([proxyAdmin, stablecoin, stablecoinProxy, wallet, walletProxy]);
}

async function main() {
  //const adminAddress = '0xCb9DE6baeD7357A768E81a82EF833f5628BEdb04'; //Goerli safe;
  //const salt = 0xf9a33bc82ac05bb7f57b22b6b7889496cee0cac4e80a973b33d02f357af90180n;
  const salt = 0x18a92cc6c74n;
  //deployContracts({salt, adminAddress});
  //deployContract({name: 'SafeProxyFactory', path: 'safe/', salt});
  const payload = getSafeProxyPayload({ salt, owners: ['0xab183ef8530299e32cc296098b0ad0a25a17e27e'], threshold: 1 });
  console.log(payload);
  await deployPayload(payload);
}

async function main2() {

  //const admin = '0xCb9DE6baeD7357A768E81a82EF833f5628BEdb04'; //Goerli safe;
  const admin = '0xee5C39ed81E49A157A9930Fc5457785198C54adf'; //Matic safe;

  const salt = 0x7b859196d21eeb3eb5ca7c450106871b956d4392ea0c53e72599c4f02c17f04an;

  const proxyAdminAddress = await deployContract({name: 'OwnedProxyAdmin', salt, constructorArguments: {types: ["address"], values: [admin] }});

  const stablecoinAddress = await deployContract({name: 'Stablecoin', salt, constructorArguments: {types: [], values: []} });
  const stablecoinProxyAddress = await deployContract({name: 'StablecoinProxy', salt, constructorArguments: {types: ["address", "address", "address"], values: [stablecoinAddress, proxyAdminAddress, admin]} });

  const walletAddress = await deployContract({name: 'Wallet', salt, constructorArguments: {types: [], values: []} });
  const walletProxyAddress = await deployContract({name: 'WalletProxy', salt, constructorArguments: {types: ["address", "address", "address", "address"], values: [walletAddress, proxyAdminAddress, admin, stablecoinProxyAddress]} });

  console.log(`OwnedProxyAdmin deployed to ${proxyAdminAddress}`);
  console.log(`Stablecoin deployed to ${stablecoinAddress}`);
  console.log(`StablecoinProxy deployed to ${stablecoinProxyAddress}`);
  console.log(`Wallet deployed to ${walletAddress}`);
  console.log(`WalletProxy deployed to ${walletProxyAddress}`);

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
