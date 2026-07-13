<script setup lang="ts">
defineProps<{
  date?: string
  subject?: string
  lesson?: string
  authors?: string
}>()
</script>

<template>
  <div class="slidev-layout cover relative h-full w-full bg-white text-black flex flex-col">
    <div class="cover-red-bar" />

    <div v-if="date" class="cover-date">{{ date }}</div>

    <div class="cover-main">
      <img class="cover-logo" src="/images/logo.png" alt="Logo">
      <div class="cover-text-group" :class="{ 'cover-text-group-tight': lesson }">
        <div v-if="subject" class="cover-subject">{{ subject }}</div>
        <div v-if="lesson" class="cover-lesson">{{ lesson }}</div>
        <div class="cover-title">
          <slot />
        </div>
      </div>
    </div>

    <div class="cover-bottom-bar">
      <img class="cover-urjc-logo" src="/images/URJC.jpg" alt="URJC">
      <div v-if="authors" class="cover-authors">{{ authors }}</div>
    </div>
  </div>
</template>

<style>
.slidev-layout.cover {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.cover-red-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 10px;
  background-color: #cb0017;
  z-index: 100;
}

.cover-date {
  position: absolute;
  top: 24px;
  right: 24px;
  font-size: 18pt;
  font-weight: 700;
  color: #333;
}

.cover-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 20px 40px 0;
  text-align: center;
}

.cover-logo {
  width: 220px;
  height: auto;
  object-fit: contain;
}

.cover-subject {
  font-size: 28pt;
  font-weight: 700;
  color: #cb0017;
}

.cover-lesson {
  font-size: 28pt;
  font-weight: 400;
  color: #cb0017;
}

.cover-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.cover-text-group-tight {
  gap: 12px;
}

.cover-title h1:first-child {
  margin: 0;
  font-size: 36pt;
  font-weight: 700;
  color: #cb0017;
  overflow-wrap: break-word;
}

.cover-bottom-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 32px;
  background-color: #000;
  flex: 0 0 20%;
  height: 20%;
}

.cover-urjc-logo {
  flex: 0 0 auto;
  height: 75px;
  width: auto;
  object-fit: contain;
}

.cover-authors {
  flex: 1;
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  color: #fff;
}
</style>
