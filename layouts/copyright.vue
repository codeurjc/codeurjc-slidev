<script setup lang="ts">
import { computed } from 'vue'
import { useNav } from '@slidev/client'

const props = defineProps<{
  date?: string
  authors?: string
}>()

const { slides } = useNav()

const coverSlide = computed(() =>
  slides.value.find(s => s.meta.slide?.frontmatter.layout === 'cover'),
)

const resolvedDate = computed(() => coverSlide.value?.meta.slide?.frontmatter.date ?? props.date)
const resolvedAuthors = computed(() => coverSlide.value?.meta.slide?.frontmatter.authors ?? props.authors)

const year = computed(() => resolvedDate.value?.split('-')[1] ?? resolvedDate.value)
</script>

<template>
  <div class="slidev-layout copyright relative h-full w-full bg-white flex flex-col">
    <div class="cover-red-bar" />

    <div v-if="resolvedDate" class="cover-date">{{ resolvedDate }}</div>

    <div class="cover-main">
      <img class="cover-logo" src="/images/logo.png" alt="Logo">
      <div class="cover-text-group">
        <div class="cover-title">
          <slot />
        </div>
      </div>
    </div>

    <div class="copyright-content">
      <p>©{{ year }}</p>
      <p>{{ resolvedAuthors }}</p>
      <p>Algunos derechos reservados</p>
      <p>Este documento se distribuye bajo la licencia</p>
      <p>&ldquo;Atribución-CompartirIgual 4.0 Internacional&rdquo;</p>
      <p>de Creative Comons Disponible en</p>
      <p>https://creativecommons.org/licenses/by-sa/4.0/deed.es</p>
    </div>

    <div class="cover-bottom-bar">
      <img class="cover-urjc-logo" src="/images/URJC.jpg" alt="URJC">
    </div>
  </div>
</template>

<style>
.slidev-layout.copyright {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.slidev-layout.copyright .cover-red-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 10px;
  background-color: #cb0017;
  z-index: 100;
}

.slidev-layout.copyright .cover-date {
  position: absolute;
  top: 24px;
  right: 24px;
  font-size: 18pt;
  font-weight: 700;
  color: #333;
}

.slidev-layout.copyright .cover-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 20px 40px 0;
  text-align: center;
}

.slidev-layout.copyright .cover-logo {
  width: 220px;
  height: auto;
  object-fit: contain;
}

.slidev-layout.copyright .cover-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.slidev-layout.copyright .cover-title h1:first-child {
  margin: 0;
  font-size: 36pt;
  font-weight: 700;
  color: #cb0017;
  overflow-wrap: break-word;
}

.copyright-content {
  flex: 0 0 auto;
  padding: 12px 32px;
  text-align: right;
  color: inherit;
}

.copyright-content p {
  margin: 0;
}

.slidev-layout.copyright .cover-bottom-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 32px;
  background-color: #000;
  flex: 0 0 20%;
  height: 20%;
}

.slidev-layout.copyright .cover-urjc-logo {
  flex: 0 0 auto;
  height: 75px;
  width: auto;
  object-fit: contain;
}
</style>
