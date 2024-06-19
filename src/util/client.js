import { 
  leapClient, 
  keplrClient, 
  cosmostationClient, 
  offlineClient, 
  nomosClient,
  metamaskClient
} from './cosmwasm';
import {DirectSecp256k1Wallet} from '@cosmjs/proto-signing';
import { SigningStargateClient } from "@cosmjs/stargate";
/**
 * Gets signing client instance
 * @param {String} wallet : Supported wallet values are; 'keplr', 'leap', 'cosmostation', 'offline'
 * @returns {SigningCosmWasmClient}
 */
 async function Client(wallet = 'privateKey', privateKey='ArhZyIMHVeKQ9wV+0UOzvxIx5H8rs1KlUMUugGuqU50I') {
  let client;
  switch (wallet) {
    case 'privateKey': {
      console.log('privateKey', privateKey);
      const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(privateKey, 'hex'));
      const [{ address }] = await wallet.getAccounts();
      const rpcEndpoint = 'https://rpc.constantine.archway.tech'; // Change to your desired RPC endpoint
      client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);
      client.address = address;
      break;
    }
    case 'cosmostation': {
      client = await cosmostationClient();
      break;
    }
    case 'keplr': {
      client = await keplrClient();
      break;
    }
    case 'leap': {
      client = await leapClient();
      break;
    }
    case 'nomos': {
      client = await nomosClient();
      break;
    }
    case 'metamask': {
      client = await metamaskClient();
      break;
    }
    case 'offline': {
      client = await offlineClient();
      break;
    }

  }
  return client;
}

async function Accounts(client = null) {
  console.log("checking client")
  if (!client) client = await Client();
  let accounts = (client['offlineSigner']) ? await client.offlineSigner.getAccounts() : [];
  if (!accounts.length && client.address) {
    // When using private key
    accounts = [{ address: client.address }];
  }

  for (let i = 0; i < accounts.length; i++) {
    accounts[i].balance = await client.wasmClient.getBalance(
      accounts[i].address, 
      client.chainInfo.currencies[0].coinMinimalDenom
    );
  }

  // Regular accounts
  if (!client.nomosClient) return accounts;

  // Nomos accounts
  let account = await client.offlineSigner.getAccount("");
  let balance = await client.wasmClient.getBalance(
    account.address,
    client.chainInfo.currencies[0].coinMinimalDenom
  );
  account.balance = balance;
  let nomosAccounts = [account];
  return nomosAccounts;
}

export { Client, Accounts };