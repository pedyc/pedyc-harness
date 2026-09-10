import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UserInfo from '../../src/components/UserInfo.vue'

describe('UserInfo', () => {
  it('renders the user name, avatar, and role from typed props', () => {
    const wrapper = mount(UserInfo, {
      props: {
        user: {
          name: '张三',
          avatar: '/avatar.png',
          role: 'Frontend Engineer',
        },
      },
    })

    expect(wrapper.get('.name').text()).toBe('张三')
    expect(wrapper.get('.role').text()).toBe('Frontend Engineer')
    expect(wrapper.get('img').attributes('src')).toBe('/avatar.png')
    expect(wrapper.get('img').attributes('alt')).toBe('张三 的头像')
  })
})
