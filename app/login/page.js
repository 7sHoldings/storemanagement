import LoginForm from '@/components/auth/LoginForm';
import BrandLogo from '@/components/BrandLogo';

export const metadata = {
  title: "Sign in — 7's Vape Love",
  description: 'Sign in to the 7’s Vape Love store management dashboard.',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col md:flex-row bg-white">
      {/* Brand panel — the shop sign on black */}
      <section className="flex flex-col justify-between bg-[#0A0A0C] text-white px-6 py-8 md:px-12 md:py-10 md:flex-1">
        <span className="hidden md:block text-[13px] text-[#A1A1AA]">7sstores.com</span>
        <div className="flex flex-col items-center gap-6 text-center py-4 md:py-0">
          <BrandLogo size="lg" className="scale-[0.62] sm:scale-75 md:scale-100 origin-center -my-6 sm:-my-3 md:my-0" />
          <div className="flex flex-col gap-2 max-w-[420px]">
            <span className="text-[20px] md:text-[22px] font-semibold">Store management</span>
            <span className="hidden md:block text-[15px] leading-relaxed text-[#A1A1AA]">
              Daily sales, cash, buying and reports for all five stores — Bells, Troup, Denison, Kerens and Reno.
            </span>
          </div>
        </div>
        <span className="hidden md:block text-[12px] text-[#71717A]">© {new Date().getFullYear()} 7S Holdings</span>
      </section>

      {/* Sign-in form */}
      <section className="flex flex-1 items-start md:items-center justify-center px-6 py-10 md:p-10">
        <div className="w-full max-w-[380px]">
          <h1 className="text-[26px] font-semibold tracking-tight text-[#18181B]">Sign in</h1>
          <p className="mt-1.5 text-[14px] text-[#71717A]">Welcome back. Enter your details to continue.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
