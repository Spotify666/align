import { Suspense } from "react";
import { SignIn } from "@/components/cloud/sign-in";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
