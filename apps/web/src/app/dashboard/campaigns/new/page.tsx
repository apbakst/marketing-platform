'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Send, Calendar, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Segment {
  id: string;
  name: string;
  memberCount: number;
}

interface Template {
  id: string;
  name: string;
}

type Step = 'details' | 'audience' | 'content' | 'review';

const STEPS: Step[] = ['details', 'audience', 'content', 'review'];

export default function NewCampaignPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('details');

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  // Data
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Fetch segments and templates
    fetchSegments();
    fetchTemplates();
  }, []);

  const fetchSegments = async () => {
    try {
      const response = await fetch('/api/segments');
      if (response.ok) {
        const data = await response.json();
        setSegments(data.segments || []);
      }
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goToNextStep = () => {
    if (!isLastStep) {
      setCurrentStep(STEPS[currentStepIndex + 1]);
    }
  };

  const goToPreviousStep = () => {
    if (!isFirstStep) {
      setCurrentStep(STEPS[currentStepIndex - 1]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'details':
        return name.trim() && subject.trim();
      case 'audience':
        return selectedSegments.length > 0;
      case 'content':
        return templateId || htmlContent.trim();
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleSaveDraft = async () => {
    await saveCampaign('draft');
  };

  const handleSchedule = async () => {
    await saveCampaign('scheduled');
  };

  const handleSendNow = async () => {
    await saveCampaign('sending');
  };

  const saveCampaign = async (status: string) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          previewText,
          fromName,
          fromEmail,
          replyTo,
          segmentIds: selectedSegments,
          excludeSegmentIds: excludedSegments,
          templateId: templateId || undefined,
          htmlContent: htmlContent || undefined,
          status,
        }),
      });

      if (response.ok) {
        const campaign = await response.json();
        if (status === 'sending') {
          // Trigger send
          await fetch(`/api/campaigns/${campaign.id}/send`, {
            method: 'POST',
          });
        }
        router.push('/dashboard/campaigns');
      }
    } catch (error) {
      console.error('Failed to save campaign:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedRecipients = selectedSegments
    .map((id) => segments.find((s) => s.id === id)?.memberCount || 0)
    .reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Campaign</h1>
          <p className="text-muted-foreground">
            Send targeted emails to your audience
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center">
        {STEPS.map((step, index) => (
          <div key={step} className="flex items-center">
            <button
              onClick={() => setCurrentStep(step)}
              className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                index <= currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index + 1}
            </button>
            <span
              className={`ml-2 text-sm ${
                step === currentStep
                  ? 'font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </span>
            {index < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-4 ${
                  index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {currentStep === 'details' && (
            <div className="space-y-4 max-w-2xl">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Campaign Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., January Newsletter"
                />
                <p className="text-xs text-muted-foreground">
                  Internal name for this campaign
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Email Subject <span className="text-destructive">*</span>
                </label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Your January update is here!"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Preview Text</label>
                <Input
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="e.g., See what's new this month..."
                />
                <p className="text-xs text-muted-foreground">
                  Shown in inbox preview, after the subject line
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">From Name</label>
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="e.g., John from Acme"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">From Email</label>
                  <Input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="e.g., hello@acme.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reply-To Email</label>
                <Input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="e.g., support@acme.com"
                />
              </div>
            </div>
          )}

          {currentStep === 'audience' && (
            <div className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Select Segments <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Choose which segments should receive this campaign
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2">
                  {segments.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">
                      No segments found. Create a segment first.
                    </p>
                  ) : (
                    segments.map((segment) => (
                      <label
                        key={segment.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedSegments.includes(segment.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSegments([
                                  ...selectedSegments,
                                  segment.id,
                                ]);
                              } else {
                                setSelectedSegments(
                                  selectedSegments.filter(
                                    (id) => id !== segment.id
                                  )
                                );
                              }
                            }}
                            className="rounded"
                          />
                          <span className="font-medium">{segment.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {segment.memberCount.toLocaleString()} members
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Exclude Segments (Optional)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Exclude profiles that belong to these segments
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {segments
                    .filter((s) => !selectedSegments.includes(s.id))
                    .map((segment) => (
                      <label
                        key={segment.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={excludedSegments.includes(segment.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExcludedSegments([
                                  ...excludedSegments,
                                  segment.id,
                                ]);
                              } else {
                                setExcludedSegments(
                                  excludedSegments.filter(
                                    (id) => id !== segment.id
                                  )
                                );
                              }
                            }}
                            className="rounded"
                          />
                          <span>{segment.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {segment.memberCount.toLocaleString()} members
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Estimated recipients
                </div>
                <div className="text-2xl font-bold">
                  {estimatedRecipients.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {currentStep === 'content' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Select Template
                </label>
                <Select
                  value={templateId}
                  onValueChange={(value) => setTemplateId(value)}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template (use custom HTML)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!templateId && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Custom HTML Content
                  </label>
                  <textarea
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    placeholder="<html>...</html>"
                    className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{{ profile.firstName }}'} for personalization.
                    Include {'{{ unsubscribe_url }}'} for the unsubscribe link.
                  </p>
                </div>
              )}

              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-sm">Available Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <code className="bg-background p-1 rounded">
                      {'{{ profile.email }}'}
                    </code>
                    <code className="bg-background p-1 rounded">
                      {'{{ profile.firstName }}'}
                    </code>
                    <code className="bg-background p-1 rounded">
                      {'{{ profile.lastName }}'}
                    </code>
                    <code className="bg-background p-1 rounded">
                      {'{{ unsubscribe_url }}'}
                    </code>
                    <code className="bg-background p-1 rounded">
                      {'{{ organization.name }}'}
                    </code>
                    <code className="bg-background p-1 rounded">
                      {'{{ campaign.name }}'}
                    </code>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-6 max-w-2xl">
              <h3 className="text-lg font-semibold">Campaign Summary</h3>

              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Campaign Name</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Subject</span>
                  <span className="font-medium">{subject}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium">
                    {fromName ? `${fromName} <${fromEmail}>` : fromEmail || 'Default'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Audience</span>
                  <span className="font-medium">
                    {selectedSegments.length} segment(s) - ~
                    {estimatedRecipients.toLocaleString()} recipients
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Content</span>
                  <span className="font-medium">
                    {templateId
                      ? templates.find((t) => t.id === templateId)?.name
                      : 'Custom HTML'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save as Draft
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSchedule}
                  disabled={isSubmitting}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule
                </Button>
                <Button onClick={handleSendNow} disabled={isSubmitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Sending...' : 'Send Now'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      {!isLastStep && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={goToPreviousStep}
            disabled={isFirstStep}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <Button onClick={goToNextStep} disabled={!canProceed()}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
