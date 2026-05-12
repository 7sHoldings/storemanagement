import LoginForm from '@/components/auth/LoginForm';
import LogoBadge from '@/components/auth/LogoBadge';

export const metadata = {
  title: "Sign in — 7's Vape Love",
  description: 'Sign in to the 7’s Vape Love store management dashboard.',
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0A] p-4">
      {/* Glowing brand blobs behind the card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[10%] top-[10%] h-[300px] w-[300px] rounded-full bg-[#39FF14] opacity-[0.15] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[10%] right-[10%] h-[300px] w-[300px] rounded-full bg-[#FF1493] opacity-[0.15] blur-[120px]"
      />

      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-[#2C2C2A] bg-[#141414] px-6 py-8 sm:px-10 sm:py-11">
        <div className="text-center">
          <LogoBadge />
          <p className="mt-3 text-[10px] uppercase tracking-[2px] text-[#888780]">
            Vapor &#9670; CBD &#9670; Kratom
          </p>
          <h1 className="mt-3 text-[22px] font-medium text-white">Welcome back</h1>
          <p className="mt-1 text-[13px] text-[#888780]">Sign in to your dashboard</p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
