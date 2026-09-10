<script setup lang="ts">
import Avatar from './components/Avatar.vue'
import UserInfo from './components/UserInfo.vue'

const harnessOutput = {
  status: 'passed',
  summary: 'Intake normalized the avatar component task.',
  normalizedTask: {
    feature: 'Create an Avatar component',
    objective: 'Display a typed user avatar with accessible alternative text.',
    constraints: ['Keep product changes under src/'],
    acceptanceCriteria: [
      'The avatar accepts typed props',
      'The image renders with meaningful alt text',
      'The component supports small, medium, and large sizes',
    ],
    testHints: ['npm run type-check', 'npm run test:unit', 'npm run build'],
    maxIterations: 3,
  },
}
</script>

<template>
  <main class="product-demo">
    <p class="eyebrow">Product demo</p>
    <h1>User information</h1>
    <UserInfo
      :user="{
        name: '张三',
        avatar: 'https://i.pravatar.cc/96?img=12',
        role: 'Frontend Engineer',
      }"
    />
    <section class="demo-section" aria-labelledby="avatar-heading">
      <p class="eyebrow">Component demo</p>
      <h2 id="avatar-heading">Avatar</h2>
      <div class="avatar-row">
        <Avatar
          name="张三"
          src="https://i.pravatar.cc/96?img=12"
          size="small"
        />
        <Avatar
          name="李四"
          src="https://i.pravatar.cc/96?img=32"
        />
        <Avatar
          name="王五"
          src="https://i.pravatar.cc/96?img=48"
          size="large"
        />
      </div>
    </section>
    <section class="demo-section" aria-labelledby="harness-output-heading">
      <p class="eyebrow">Harness output</p>
      <h2 id="harness-output-heading">Normalized task JSON</h2>
      <pre class="harness-output">{{ JSON.stringify(harnessOutput, null, 2) }}</pre>
    </section>
  </main>
</template>

<style scoped>
.demo-section {
  margin-top: 40px;
}

.demo-section h2 {
  margin: 0 0 16px;
  font-size: 1.25rem;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.harness-output {
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.72);
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
