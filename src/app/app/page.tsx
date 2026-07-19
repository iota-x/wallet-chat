import { WalletProviders } from "@/components/WalletProviders";
import { App } from "@/components/App";
import { Toaster } from "@/components/Toaster";

export default function ProductPage() {
  return (
    <WalletProviders>
      <App />
      <Toaster />
    </WalletProviders>
  );
}
