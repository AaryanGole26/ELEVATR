import { ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import Chatbot from '../Chatbot/Chatbot';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-[4.5rem]">
        {children}
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
};

export default Layout;