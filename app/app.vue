<script setup lang="ts">
// Load the signed-in user's favourite ids once so every heart starts correct.
const { load } = useFavourites()
const route = useRoute()
onMounted(() => load())
</script>

<template>
  <NuxtLoadingIndicator color="#C6F135" :height="2.5" />
  <div
    class="min-h-screen bg-bg font-body text-mist antialiased flex flex-col"
    :class="{
      'max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]': route.path !== '/map',
      'overflow-hidden h-screen max-lg:h-[100dvh] max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]': route.path === '/map',
    }"
  >
    <AppNav class="shrink-0" />
    <main class="flex-1 min-h-0 w-full relative">
      <NuxtPage />
    </main>
    <MobileBottomNav />
    <FavouritesSheet />
    <ContributeModal />
    <AuthModal />
    <SignOutModal />
  </div>
</template>
