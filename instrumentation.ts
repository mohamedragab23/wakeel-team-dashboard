export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runStartupValidation } = await import('@/lib/startupValidation');
    runStartupValidation();
  }
}
