import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Avatar from '../../src/components/Avatar.vue'

describe('Avatar', () => {
  it('renders the typed avatar props and accessible alt text', () => {
    const wrapper = mount(Avatar, {
      props: {
        name: '张三',
        src: '/avatar.png',
        size: 'large',
      },
    })

    expect(wrapper.attributes('src')).toBe('/avatar.png')
    expect(wrapper.attributes('alt')).toBe('张三 的头像')
    expect(wrapper.classes()).toContain('avatar--large')
  })

  it('uses the medium size by default', () => {
    const wrapper = mount(Avatar, {
      props: {
        name: '李四',
        src: '/avatar.png',
      },
    })

    expect(wrapper.classes()).toContain('avatar--medium')
  })
})
