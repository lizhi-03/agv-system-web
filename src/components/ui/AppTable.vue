<script setup lang="ts">
withDefaults(defineProps<{ tableClass?: string }>(), { tableClass: '' })
</script>

<template>
  <div class="table-shell">
    <table :class="['data-table', tableClass]">
      <slot />
    </table>
  </div>
</template>
