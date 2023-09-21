import hardhat, { ethers } from "hardhat";

type Address = string | {target: string | { getAddress(): Promise<string>;}};

async function getAddress(contract: Address) {
  return typeof contract === 'string' ? contract : typeof contract.target === 'string' ? contract.target : await contract.target.getAddress();
}

async function verify(address: any, name: string, options?: {constructorArguments?: Address[], openzepplinContract?: boolean}) {
  const constructorArguments = options?.constructorArguments ?? [];
  const openzepplinContract = options?.openzepplinContract ?? false;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`Verifying ${name}...`);
    try {
      await hardhat.run('verify:verify', {
        address,
        contract: openzepplinContract ? undefined : `contracts/${name}.sol:${name}`,
        constructorArguments: await Promise.all(constructorArguments?.map(async(constructorArgument) => {
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

async function deploy(name: string, options?: {constructorArguments?: Address[], openzepplinContract?: boolean}) {
  const constructorArguments = options?.constructorArguments ?? [];
  const openzepplinContract = options?.openzepplinContract ?? false;
  console.log(`Deploying ${name}...`);
  const contract = await ethers.deployContract(name, constructorArguments);
  await contract.waitForDeployment();
  console.log(`${name} deployed to ${contract.target}`);
  (async () => {
    await verify(contract.target, name, {constructorArguments, openzepplinContract});
  })();
  return contract;
}

async function deployWithDeployer(name: string, salt: bigint, options?: {constructorArguments?: {types: any[], values: Address[]}, openzepplinContract?: boolean}) {
  const factoryAddress = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
  const { bytecode } = require(`../artifacts/contracts/${name}.sol/${name}.json`);
  const initCode = bytecode + new ethers.AbiCoder().encode(options?.constructorArguments?.types ?? [], options?.constructorArguments?.values ?? []).slice(2);
  const saltHex = '0x' + salt.toString(16).padStart(64, "0");
  const create2Address = ethers.getCreate2Address(factoryAddress, saltHex, ethers.keccak256(initCode));
  console.log(`Deploying ${name} at ${create2Address}`);
  const [account] = await ethers.getSigners();
  const tx = await account.sendTransaction({to: factoryAddress, data: saltHex + initCode.slice(2)});
  await tx.wait();
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, 300*1000));
    await verify(create2Address, name, { constructorArguments: options?.constructorArguments?.values, openzepplinContract: options?.openzepplinContract });
  })();
  return create2Address;
}

async function main() {

  const [account] = await ethers.getSigners();
  
  console.log(account.address);
  
  /*const admin = account.address;

  const salt = 0x7b85ea53ebe02abec4e54bd655390aeeaad8a51e43ce2e8ec25fc4f02c17f04an;

  const proxyAdminAddress = await deployWithDeployer('OwnedProxyAdmin', salt, { constructorArguments: {types: ["address"], values: [admin] }});

  const stablecoinAddress = await deployWithDeployer('Stablecoin', salt, { constructorArguments: {types: [], values: []} });
  const stablecoinProxyAddress = await deployWithDeployer('StablecoinProxy', salt, { constructorArguments: {types: ["address", "address", "address"], values: [stablecoinAddress, proxyAdminAddress, admin]} });

  const minterAddress = await deployWithDeployer('Minter', salt, { constructorArguments: {types: [], values: []} });
  const minterProxyAddress = await deployWithDeployer('MinterProxy', salt, { constructorArguments: {types: ["address", "address", "address", "address"], values: [minterAddress, proxyAdminAddress, admin, stablecoinProxyAddress]} });

  const walletAddress = await deployWithDeployer('Wallet', salt, { constructorArguments: {types: [], values: []} });
  const walletProxyAddress = await deployWithDeployer('WalletProxy', salt, { constructorArguments: {types: ["address", "address", "address", "address"], values: [walletAddress, proxyAdminAddress, admin, stablecoinProxyAddress]} });

  console.log(`OwnedProxyAdmin deployed to ${proxyAdminAddress}`);
  console.log(`Stablecoin deployed to ${stablecoinAddress}`);
  console.log(`StablecoinProxy deployed to ${stablecoinProxyAddress}`);
  console.log(`Minter deployed to ${minterAddress}`);
  console.log(`MinterProxy deployed to ${minterProxyAddress}`);
  console.log(`Wallet deployed to ${walletAddress}`);
  console.log(`WalletProxy deployed to ${walletProxyAddress}`);*/

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
