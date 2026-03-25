import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, BookOpen, ThumbsUp, ThumbsDown, Save, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";

export default function Profile() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [stats, setStats] = useState({ liked: 0, disliked: 0, reading: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });

    Promise.all([
      supabase.from("user_feedback").select("liked").eq("user_id", user.id),
      supabase.from("reading_progress").select("id").eq("user_id", user.id),
    ]).then(([feedbackRes, progressRes]) => {
      const feedback = feedbackRes.data || [];
      setStats({
        liked: feedback.filter((f) => f.liked).length,
        disliked: feedback.filter((f) => !f.liked).length,
        reading: progressRes.data?.length || 0,
      });
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Profile updated successfully." });
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <Navbar />

      {/* Profile header */}
      <div className="border-b bg-muted/30">
        <div className="container py-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-inner">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">{displayName || "Your Profile"}</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container max-w-2xl py-8">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { icon: ThumbsUp, label: "Liked", value: stats.liked, color: "text-primary", bg: "bg-primary/10" },
            { icon: ThumbsDown, label: "Disliked", value: stats.disliked, color: "text-destructive", bg: "bg-destructive/10" },
            { icon: BookOpen, label: "Reading", value: stats.reading, color: "text-accent", bg: "bg-accent/10" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="glass-card overflow-hidden">
              <CardContent className="flex flex-col items-center p-5">
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <span className="text-2xl font-bold">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Account settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <User className="h-5 w-5 text-primary" /> Account Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email
                </Label>
                <Input value={user?.email || ""} disabled className="h-11 rounded-xl bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-11 rounded-xl"
                  placeholder="Enter your name"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-full px-6">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <Separator className="my-6" />

        <Button variant="outline" className="w-full rounded-xl" onClick={signOut}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
