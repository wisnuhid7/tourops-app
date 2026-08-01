import { useQuery } from "@tanstack/react-query";

/**
 * Global "TEST ENVIRONMENT" banner. Driven by GET /api/environment so that
 * production deployments (where the flag is false) never show it.
 */
export function TestEnvironmentBanner() {
  const { data } = useQuery<{ testEnvironment: boolean }>({
    queryKey: ["/api/environment"],
    staleTime: Infinity,
    retry: false,
  });
  if (!data?.testEnvironment) return null;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 text-center text-xs font-bold uppercase tracking-widest py-1 pointer-events-none"
      data-testid="test-environment-banner"
    >
      TourOps Test Environment — data may be reset at any time
    </div>
  );
}
