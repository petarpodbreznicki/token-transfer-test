import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import Wallet from '@project-serum/sol-wallet-adapter';
import { Connection, SystemProgram, Transaction, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { createTransferBetweenSplTokenAccountsInstruction, getOwnedTokenAccounts } from './utils/tokens';
import { parseTokenAccountData } from './utils/tokens/data';

function toHex(buffer) {
  return Array.prototype.map
    .call(buffer, (x) => ('00' + x.toString(16)).slice(-2))
    .join('');
}

function App() {
  const [logs, setLogs] = useState([]);
  function addLog(log) {
    setLogs((logs) => [...logs, log]);
  }

  const network = clusterApiUrl('devnet');
  const [providerUrl, setProviderUrl] = useState('https://www.sollet.io');
  const connection = useMemo(() => new Connection(network), [network]);
  const urlWallet = useMemo(() => new Wallet(providerUrl, network), [
    providerUrl,
    network,
  ]);
  const injectedWallet = useMemo(() => {
    try {
      return new Wallet(window.solana, network);
    } catch (e) {
      console.log(`Could not create injected wallet: ${e}`);
      return null;
    }
  }, [network]);
  const [selectedWallet, setSelectedWallet] = useState(undefined);
  const [, setConnected] = useState(false);
  useEffect(() => {
    if (selectedWallet) {
      selectedWallet.on('connect', () => {
        setConnected(true);
        addLog('Connected to wallet ' + selectedWallet.publicKey.toBase58());
      });
      selectedWallet.on('disconnect', () => {
        setConnected(false);
        addLog('Disconnected from wallet');
      });
      selectedWallet.connect();
      return () => {
        selectedWallet.disconnect();
      };
    }
  }, [selectedWallet]);

  async function sendTransaction() {
    try {
      // Destination is the Associated Token Account of the receiver.
      const destinationAddress = new PublicKey('46w2oyWknW7wAJiMWDNEU1maJSYM62vhot11s6shwWw4');
      // Mint address of the token (random token I made on devnet)
      const mxMint = new PublicKey('mx3edW3gRoM9J4sJKtuobQW3ZB1HeuZH8hQeH9HDkF3');
      // Decimals of the token mint
      const decimals = 4;
      // Send 1 token
      const transferAmountString = '1';
      let amountFix = Math.round(parseFloat(transferAmountString) * 10 ** decimals);
      // Not sure what this is
      const memo = null;
      
      // We need to get the Associated Token Account of the sender (the wallet).
      // If they don't have it, this will fail and the transaction too.
      // It will also fail if they don't have enough balance, but hey, one step at a time.
      const sourceSplTokenAccount = (
        await getOwnedTokenAccounts(connection, selectedWallet.publicKey)
      )
        .map(({ publicKey, accountInfo }) => {
          console.log(publicKey)
          return { publicKey, parsed: parseTokenAccountData(accountInfo.data) };
        })
        .filter(({ parsed }) => parsed.mint.equals(mxMint))
        .sort((a, b) => {
          return b.parsed.amount - a.parsed.amount;
        })[0];

      let transaction = createTransferBetweenSplTokenAccountsInstruction({
        ownerPublicKey: selectedWallet.publicKey,
        mint: mxMint,
        decimals: 4,
        sourcePublicKey: sourceSplTokenAccount.publicKey,
        destinationPublicKey: destinationAddress,
        amount: amountFix,
        memo: memo
      });

      // let transaction = new Transaction().add(
      //   SystemProgram.transfer({
      //     fromPubkey: selectedWallet.publicKey,
      //     toPubkey: selectedWallet.publicKey,
      //     lamports: 100,
      //   })
      // );
      addLog('Getting recent blockhash');
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;
      addLog(`Sending ${transferAmountString} of ${mxMint.toString()} to recipient at: ${destinationAddress.toString()}`)
      addLog('Sending signature request to wallet');
      transaction.feePayer = selectedWallet.publicKey;
      let signed = await selectedWallet.signTransaction(transaction);
      addLog('Got signature, submitting transaction');
      let signature = await connection.sendRawTransaction(signed.serialize());
      addLog('Submitted transaction ' + signature + ', awaiting confirmation');
      await connection.confirmTransaction(signature, 'singleGossip');
      addLog('Transaction ' + signature + ' confirmed');
    } catch (e) {
      console.warn(e);
      addLog('Error: ' + e.message);
    }
  }

  async function signMessage() {
    try {
      const message = "Please sign this message for proof of address ownership.";
      addLog('Sending message signature request to wallet');
      const data = new TextEncoder().encode(message);
      const signed = await selectedWallet.sign(data, 'hex');
      addLog('Got signature: ' + toHex(signed.signature));
    } catch (e) {
      console.warn(e);
      addLog('Error: ' + e.message);
    }
  }

  return (
    <div className="App">
      <h1>Wallet Adapter Demo</h1>
      <div>Network: {network}</div>
      <div>
        Waller provider:{' '}
        <input
          type="text"
          value={providerUrl}
          onChange={(e) => setProviderUrl(e.target.value.trim())}
        />
      </div>
      {selectedWallet && selectedWallet.connected ? (
        <div>
          <div>Wallet address: {selectedWallet.publicKey.toBase58()}.</div>
          <button onClick={sendTransaction}>Send Token Transaction</button>
          <button onClick={signMessage}>Sign Message</button>
          <button onClick={() => selectedWallet.disconnect()}>Disconnect</button>
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedWallet(urlWallet)}>Connect to Wallet</button>
          <button onClick={() => setSelectedWallet(injectedWallet)}>Connect to Injected Wallet</button>
        </div>
      )}
      <hr />
      <div className="logs">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
