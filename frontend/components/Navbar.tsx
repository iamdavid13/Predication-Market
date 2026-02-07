'use client';

import { useState, useEffect } from 'react';
import ConnectWallet from './ConnectWallet';

export default function Navbar() {
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    // Check for saved wallet address
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setWalletAddress(savedAddress);
    }

    // Listen for storage changes (when wallet is connected/disconnected)
    const handleStorageChange = () => {
      const savedAddress = localStorage.getItem('walletAddress');
      setWalletAddress(savedAddress);
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically for changes in the same tab
    const interval = setInterval(handleStorageChange, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const truncateAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleModalClose = () => {
    // Refresh wallet address when modal closes
    const savedAddress = localStorage.getItem('walletAddress');
    setWalletAddress(savedAddress);
    setShowWalletModal(false);
  };

  return (
    <nav className="border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-8">
          {/* Left: Brand and Navigation */}
          <div className="flex items-center gap-8">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  UnusualProbs
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Market Aggregator
                </p>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <button className="flex items-center gap-2 text-green-400 font-medium hover:text-green-300 transition-colors">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Live
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Markets
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Divergence
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Arbitrage
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Whale Watch
              </button>
            </div>
          </div>

          {/* Center: Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search markets..."
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 pl-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Right: Connect Wallet */}
          <div>
            <button
              onClick={() => setShowWalletModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-white hover:border-blue-500 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {walletAddress ? truncateAddress(walletAddress) : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Modal */}
      <ConnectWallet
        isOpen={showWalletModal}
        onClose={handleModalClose}
      />
    </nav>
  );
}
