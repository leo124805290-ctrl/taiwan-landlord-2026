'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api, setAuthToken, ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setError('請輸入密碼');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.post<{
        user: { id: string; email: string; role: string };
        tokens: { accessToken: string; refreshToken?: string; expiresIn?: number };
      }>('/api/auth/login', { password: password.trim() });

      const access = result.tokens?.accessToken;
      if (!access) {
        throw new Error('登入回應缺少 accessToken');
      }
      setAuthToken(access);
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || '登入失敗');
      } else {
        setError(err instanceof Error ? err.message : '登入失敗，請稍後再試');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-gray-200">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center">
                  <svg 
                    className="w-8 h-8 text-blue-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                    />
                  </svg>
                </div>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center text-gray-800">
              租屋管理系統
            </CardTitle>
            <CardDescription className="text-center text-gray-600">
              簡易版登入系統
              <br />
              <span className="text-sm text-gray-500">請輸入密碼 &quot;enter&quot; 登入</span>
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label 
                  htmlFor="password" 
                  className="text-sm font-medium text-gray-700"
                >
                  密碼
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  className="h-12 text-base"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500">
                  簡易版：密碼為 <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-700">enter</code>
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium"
                isLoading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? '登入中...' : '登入'}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="space-y-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg 
                        className="w-4 h-4 text-blue-600" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-gray-600">
                      <strong className="font-medium">簡易版說明：</strong>
                      密碼與後端約定一致時會向 Zeabur API 取得 JWT，後續請求會帶 Authorization。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            v2.0 建置中 • 台灣房東越南租客管理系統
          </p>
        </div>
      </div>
    </div>
  );
}