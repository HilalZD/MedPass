import RegisterSW from "@/components/RegisterSW";

// Same page, plus the offline service worker registration.
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RegisterSW />
    </>
  );
}
