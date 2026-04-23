import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-white border-t mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-500">
        <span>© {new Date().getFullYear()} ELEVATR. All rights reserved.</span>
      </div>
    </footer>
  );
};

export default Footer;


