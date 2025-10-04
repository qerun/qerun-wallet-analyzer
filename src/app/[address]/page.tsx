import type { Metadata } from "next";
import WalletAnalyzerPage from "@/components/wallet-analyzer-page";

type AddressPageParams = Promise<{ address: string }>;

type AddressPageProps = {
  params: AddressPageParams;
};

export async function generateMetadata({ params }: AddressPageProps): Promise<Metadata> {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  return {
    title: `${decodedAddress} | Qerun Wallet Analyzer`,
  };
}

export default async function AddressPage({ params }: AddressPageProps) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  return <WalletAnalyzerPage initialAddress={decodedAddress} />;
}
