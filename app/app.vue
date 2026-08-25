<script setup lang="ts">
// Load the signed-in user's favourite ids once so every heart starts correct.
const { load } = useFavourites()
onMounted(() => load())
</script>

<template>
  <!-- max-lg: extra bottom padding keeps the last content clear of the
       mobile bottom navigation (bar height + iOS safe-area inset). -->
  <div class="min-h-screen bg-bg font-body text-mist antialiased max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
    <AppNav />
    <NuxtPage />
    <MobileBottomNav />
    <FavouritesSheet />
    <ContributeModal />
    <AuthModal />
    <SignOutModal />
    <ToastHost />
  </div>
</template>
