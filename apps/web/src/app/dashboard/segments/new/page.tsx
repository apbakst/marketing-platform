'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SegmentBuilder,
  createDefaultGroup,
  SegmentDefinition,
} from '@/components/segment-builder';

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<SegmentDefinition>(
    createDefaultGroup()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);

  const handleEstimateSize = async () => {
    // TODO: Call API to estimate segment size
    setEstimatedSize(Math.floor(Math.random() * 1000) + 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          conditions,
        }),
      });

      if (response.ok) {
        router.push('/dashboard/segments');
      }
    } catch (error) {
      console.error('Failed to create segment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Segment</h1>
          <p className="text-muted-foreground">
            Define conditions to dynamically group your profiles
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Segment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Active Premium Users"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Users on premium plan who logged in last 30 days"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segment Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <SegmentBuilder
              value={conditions}
              onChange={setConditions}
              eventNames={[
                'Page Viewed',
                'Product Viewed',
                'Added to Cart',
                'Checkout Started',
                'Order Completed',
                'Signed Up',
                'Logged In',
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                {estimatedSize !== null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {estimatedSize.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      estimated profiles
                    </span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleEstimateSize}
                  >
                    Estimate segment size
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !name.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Creating...' : 'Create Segment'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
