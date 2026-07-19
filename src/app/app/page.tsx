import { WalletProviders } from "@/components/WalletProviders";
import { App } from "@/components/App";

export default function ProductPage() {
  return (
    <WalletProviders>
      <App />
    </WalletProviders>
  );
}
