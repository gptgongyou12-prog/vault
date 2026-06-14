import { get, post, put, del } from './client'
import type { User } from '../types/api'

export interface UserResponse {
  id: number
  username: string
  email: string
  is_admin: boolean
  is_owner: boolean
  lite_mode: boolean
  created_at: string
  subscription_type: string
  subscription_expires_at: string | null
  subscription_warning_enabled: boolean
  subscription_warning_message: string
  last_seen_at: string | null
  is_online: boolean
}

export interface CreateInviteResponse {
  id: number
  token: string
  email: string
}

export interface CreateResetLinkResponse {
  id: number
  token: string
  email: string
}

export async function listUsers(): Promise<UserResponse[]> {
  return get<UserResponse[]>('/api/admin/users')
}

export async function listUsersPublic(): Promise<UserResponse[]> {
  return get<UserResponse[]>('/api/users')
}

export async function createInvite(email?: string): Promise<CreateInviteResponse> {
  return post<CreateInviteResponse>('/api/admin/users/invite', { email })
}

export async function updateUserRole(userId: number, isAdmin: boolean): Promise<UserResponse> {
  return put<UserResponse>(`/api/admin/users/${userId}/role`, {
    user_id: userId,
    is_admin: isAdmin,
  })
}

export async function renameUser(userId: number, username: string): Promise<UserResponse> {
  return put<UserResponse>(`/api/admin/users/${userId}/rename`, {
    user_id: userId,
    username,
  })
}

export async function deleteUser(userId: number): Promise<void> {
  return del(`/api/admin/users/${userId}`)
}

export async function setUserLiteMode(userId: number, liteMode: boolean): Promise<{ lite_mode: boolean }> {
  return put<{ lite_mode: boolean }>(`/api/admin/users/${userId}/lite-mode`, { lite_mode: liteMode })
}

export async function createResetLink(userId: number): Promise<CreateResetLinkResponse> {
  return post<CreateResetLinkResponse>(`/api/admin/users/${userId}/reset-link`, {
    user_id: userId,
  })
}

export async function registerWithInvite(
  username: string,
  email: string,
  password: string,
  inviteToken: string
): Promise<{ user: User }> {
  return post<{ user: User }>(
    '/api/auth/register-with-invite',
    {
      username,
      email,
      password,
      invite_token: inviteToken,
    },
    { requiresAuth: false }
  )
}

export async function resetPassword(
  password: string,
  resetToken: string
): Promise<{ message: string }> {
  return post<{ message: string }>(
    '/api/auth/reset-password',
    {
      password,
      reset_token: resetToken,
    },
    { requiresAuth: false }
  )
}

export async function validateResetToken(token: string): Promise<{ valid: boolean }> {
  return get<{ valid: boolean }>(`/api/auth/validate-reset-token?token=${token}`)
}

export async function validateInviteToken(token: string): Promise<{ valid: boolean }> {
  return get<{ valid: boolean }>(`/api/auth/validate-invite-token?token=${token}`)
}

export async function updateSubscription(userId: number, subscriptionType: string, daysToAdd?: number): Promise<UserResponse> {
  return put<UserResponse>(`/api/admin/users/${userId}/subscription`, {
    user_id: userId,
    subscription_type: subscriptionType,
    days_to_add: daysToAdd,
  })
}

export async function updateSubscriptionWarning(userId: number, enabled: boolean, message?: string): Promise<UserResponse> {
  return put<UserResponse>(`/api/admin/users/${userId}/subscription/warning`, {
    user_id: userId,
    enabled,
    message,
  })
}
