// ═══════════════════════════════════════════════════════════════════════════════
// ETH CONVERSION BACKEND V1 - Simple sendTransaction Method
// Converts backend ETH → Treasury wallet using wallet.sendTransaction()
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════════════════
// WALLET CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
const PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const TREASURY = '0x4024Fd78E2AD5532FBF3ec2B3eC83870FAe45fC7';

// Public RPC endpoints (no API key needed)
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
  'https://1rpc.io/eth'
];

let provider = null;
let wallet = null;

async function initProvider() {
  for (const rpc of RPC_URLS) {
    try {
      console.log('Trying RPC:', rpc);
      const p = new ethers.JsonRpcProvider(rpc, 1, { staticNetwork: ethers.Network.from(1) });
      await Promise.race([p.getBlockNumber(), new Promise((_, r) => setTimeout(() => r('timeout'), 5000))]);
      provider = p;
      if (PRIVATE_KEY) {
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log('Wallet loaded:', wallet.address);
      }
      console.log('✅ Connected to', rpc);
      return true;
    } catch (e) {
      console.log('Failed:', rpc);
      continue;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V1 METHOD: Simple sendTransaction
// GAS IS PAID DURING EXECUTION (not before) - you earn while gas is deducted
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/convert', async (req, res) => {
  try {
    const { amount, amountETH, to, toAddress, treasury } = req.body;
    if (!provider || !wallet) await initProvider();
    if (!wallet) return res.status(500).json({ error: 'Wallet not configured' });

    const ethAmount = parseFloat(amountETH || amount) || 0.01;
    const destination = to || toAddress || treasury || TREASURY;

    console.log('Converting', ethAmount, 'ETH to', destination);

    const balance = await provider.getBalance(wallet.address);
    const balanceETH = parseFloat(ethers.formatEther(balance));
    
    // GAS CHECK: Only verify minimum needed for gas (~0.002 ETH)
    // Gas is deducted AT EXECUTION TIME, not before
    if (balanceETH < 0.002) {
      return res.status(400).json({ error: 'Need minimum 0.002 ETH for gas', balance: balanceETH });
    }
    
    // Calculate max transferable (balance minus gas reserve)
    const maxTransfer = Math.min(ethAmount, balanceETH - 0.002);
    if (maxTransfer <= 0) {
      return res.status(400).json({ error: 'Insufficient balance after gas reserve', balance: balanceETH });
    }

    console.log('Executing TX - gas will be deducted during this execution');
    
    // Simple sendTransaction method - GAS PAID NOW DURING EXECUTION
    const tx = await wallet.sendTransaction({
      to: destination,
      value: ethers.parseEther(maxTransfer.toFixed(8))
    });

    console.log('TX sent:', tx.hash, '- Gas being deducted now');
    const receipt = await tx.wait(1);
    console.log('Confirmed block:', receipt.blockNumber, '- Gas paid:', ethers.formatEther(receipt.gasUsed * receipt.gasPrice), 'ETH');

    res.json({
      success: true,
      txHash: tx.hash,
      hash: tx.hash,
      transactionHash: tx.hash,
      from: wallet.address,
      to: destination,
      amount: ethAmount,
      blockNumber: receipt.blockNumber
    });
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Alias endpoints
app.post('/send-eth', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });
app.post('/withdraw', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });
app.post('/transfer', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });

app.get('/balance', async (req, res) => {
  try {
    if (!provider || !wallet) await initProvider();
    const bal = await provider.getBalance(wallet.address);
    res.json({ wallet: wallet.address, balance: ethers.formatEther(bal), treasury: TREASURY });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/status', async (req, res) => {
  let bal = 0;
  try { if (provider && wallet) bal = parseFloat(ethers.formatEther(await provider.getBalance(wallet.address))); } catch (e) {}
  res.json({ status: 'online', method: 'V1-sendTransaction', wallet: wallet?.address, balance: bal.toFixed(6) });
});

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

initProvider().then(() => app.listen(PORT, '0.0.0.0', () => console.log('V1 Backend on port', PORT)));
