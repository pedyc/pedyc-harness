<script setup lang="ts">
interface UserInfoData {
  name: string
  avatar: string
  role: string
}

defineProps<{
  user: UserInfoData
}>()
</script>

<template>
  <article class="user-info">
    <img class="avatar" :src="user.avatar" :alt="`${user.name} 的头像`" />
    <div class="details">
      <h2 class="name">{{ user.name }}</h2>
      <p class="role">{{ user.role }}</p>
    </div>
  </article>
</template>

<style scoped>
.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 360px;
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.65);
  box-shadow: 0 10px 30px rgba(2, 8, 23, 0.45);
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.details {
  min-width: 0;
}

.name {
  margin: 0;
  color: #f8fafc;
  font-size: 1rem;
  line-height: 1.4;
}

.role {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 0.875rem;
}
</style>
