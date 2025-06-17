import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

const HelpModal: React.FC = () => {
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const toggleHelp = () => setShowHelp(!showHelp);
  
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-40 rounded-full h-10 w-10 shadow-md"
        onClick={toggleHelp}
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      {showHelp && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
      <Card className="w-full max-w-2xl" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            How to Use This Tool
          </CardTitle>
          <CardDescription>A guide for research scientists working with spatial and data analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                1
              </span>
              Define Your Task
            </h3>
            <p className="text-muted-foreground ml-8">
              Start by describing what you want to analyze or visualize. Be specific about the data and desired
              outcome.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                2
              </span>
              Upload Your Data
            </h3>
            <p className="text-muted-foreground ml-8">
              Add your data files (CSV, shapefiles, etc.) using the file uploader. These will be used in your
              analysis.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                3
              </span>
              Generate Analysis
            </h3>
            <p className="text-muted-foreground ml-8">
              Click "Generate Analysis" to create code that processes your data according to your instructions.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                4
              </span>
              Run and View Results
            </h3>
            <p className="text-muted-foreground ml-8">
              Run the generated code to process your data. View the results as maps, charts, or data files.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => setShowHelp(false)} className="w-full">
            Close Help
          </Button>
        </CardFooter>
      </Card>
    </div>
      )}
    </>
  );
};

export default HelpModal;