'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Users, RefreshCw, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isActive: boolean;
  lastCalculatedAt: string | null;
  createdAt: string;
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSegments();
  }, []);

  const fetchSegments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/segments');
      if (response.ok) {
        const data = await response.json();
        setSegments(data.segments || []);
      }
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculate = async (segmentId: string) => {
    try {
      await fetch(`/api/segments/${segmentId}/calculate`, {
        method: 'POST',
      });
      // Refresh after a delay to allow calculation
      setTimeout(fetchSegments, 2000);
    } catch (error) {
      console.error('Failed to trigger recalculation:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Segments</h1>
            <p className="text-muted-foreground">
              Create and manage dynamic audience segments
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-full mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Segments</h1>
          <p className="text-muted-foreground">
            Create and manage dynamic audience segments
          </p>
        </div>
        <Link href="/dashboard/segments/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Segment
          </Button>
        </Link>
      </div>

      {segments.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No segments yet</h3>
          <p className="mt-2 text-muted-foreground">
            Create your first segment to start organizing your audience.
          </p>
          <Link href="/dashboard/segments/new">
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Segment
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {segments.map((segment) => (
            <Card
              key={segment.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                segment.isActive ? '' : 'opacity-60'
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Link href={`/dashboard/segments/${segment.id}`}>
                    <CardTitle className="text-lg hover:underline">
                      {segment.name}
                    </CardTitle>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        segment.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {segment.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRecalculate(segment.id)}
                      title="Recalculate segment"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {segment.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">
                      {segment.memberCount.toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      members
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {segment.lastCalculatedAt
                    ? `Last updated: ${new Date(
                        segment.lastCalculatedAt
                      ).toLocaleString()}`
                    : 'Not calculated yet'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
