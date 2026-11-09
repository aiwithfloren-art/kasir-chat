import "./globals.css";

export const metadata = {
  title: "Kasir Chat: AI Cashier for Chat Sellers",
  description: "Customers order in plain chat. AI creates the PayPal checkout, confirms payment and answers the owner's questions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
