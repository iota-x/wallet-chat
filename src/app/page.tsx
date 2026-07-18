import { WalletProviders } from "@/components/WalletProviders";
import { App } from "@/components/App";

export default function Page() {
  return (
    <WalletProviders>
      <App />
    </WalletProviders>
  );
}
