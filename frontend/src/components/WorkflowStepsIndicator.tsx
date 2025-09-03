const WorkflowStepsIndicator = ({ currentStep }: { currentStep: number }) => (
  <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 bg-background border border-border rounded-full shadow-lg px-2 py-1">
    <div className="flex items-center gap-1">
      <div
        className={`flex items-center gap-1 px-3 py-1 rounded-full ${currentStep >= 1 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <span className="font-medium text-sm">1. Define</span>
      </div>
      <div className="w-4 h-px bg-border" />
      <div
        className={`flex items-center gap-1 px-3 py-1 rounded-full ${currentStep >= 2 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <span className="font-medium text-sm">2. Process</span>
      </div>
      <div className="w-4 h-px bg-border" />
      <div
        className={`flex items-center gap-1 px-3 py-1 rounded-full ${currentStep >= 3 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <span className="font-medium text-sm">3. Results</span>
      </div>
    </div>
  </div>
);

export default WorkflowStepsIndicator;