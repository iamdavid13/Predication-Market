'use client';

import { useState, useEffect } from 'react';

interface ConnectWalletProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConnectWallet({ isOpen, onClose }: ConnectWalletProps) {
  const [walletAddress, setWalletAddress] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Load wallet address from localStorage on mount
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setWalletAddress(savedAddress);
      setIsConnected(true);
    }
  }, []);

  const handleSave = () => {
    if (inputValue.trim()) {
      localStorage.setItem('walletAddress', inputValue.trim());
      setWalletAddress(inputValue.trim());
      setIsConnected(true);
      setInputValue('');
      onClose();
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('walletAddress');
    setWalletAddress('');
    setIsConnected(false);
    setInputValue('');
    onClose();
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {isConnected ? (
          <div className="space-y-4">
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">Connected Address</p>
              <p className="text-sm text-white font-mono break-all">
                {walletAddress}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 bg-red-900/20 border border-red-900 text-red-400 rounded-lg hover:bg-red-900/30 transition-colors"
            >
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Wallet Address
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
              <p className="text-xs text-gray-500 mt-2">
                Paste your Ethereum wallet address to connect
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={!inputValue.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Address
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
