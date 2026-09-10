<script setup lang="ts">
interface AvatarProps {
  src: string
  name: string
  size?: 'small' | 'medium' | 'large'
}

withDefaults(defineProps<AvatarProps>(), {
  size: 'medium',
})
</script>

<template>
  <img
    class="avatar"
    :class="`avatar--${size}`"
    :src="src"
    :alt="`${name} 的头像`"
  />
</template>

<style scoped>
.avatar {
  display: block;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
  background: #1e293b;
}

.avatar--small {
  width: 40px;
  height: 40px;
}

.avatar--medium {
  width: 64px;
  height: 64px;
}

.avatar--large {
  width: 96px;
  height: 96px;
}
</style>
