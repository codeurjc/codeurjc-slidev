<template>
  <div class="slidev-layout default relative h-full bg-white text-black">
    <div class="red-bar" />
    <div class="logo">
      <img src="/images/logo.png" alt="Logo">
    </div>
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.red-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 10px;
  background-color: #cb0017;
  z-index: 100;
}

.logo {
  position: absolute;
  top: 20px;
  right: 24px;
  z-index: 50;
}

.logo img {
  height: 48px;
  width: auto;
}

.content {
  padding-top: 40px;
  padding-right: 120px;
}
</style>
