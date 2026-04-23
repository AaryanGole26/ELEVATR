import { useState, useEffect } from 'react';

// Generic hook for localStorage with TypeScript support
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  // Get from local storage then parse stored json or return initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      
      // Save to local storage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

// Specific hook for resume data persistence
export function useResumeStorage() {
  const [resumeData, setResumeData] = useLocalStorage('resume-draft', {
    personalInfo: {
      name: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      website: ''
    },
    summary: '',
    education: [],
    workExperience: [],
    projects: [],
    skills: [],
    certifications: [],
    template: 'modern',
    aiEnhancement: false
  });

  const [lastUsedTemplate, setLastUsedTemplate] = useLocalStorage('last-template', 'modern');

  const clearResumeData = () => {
    setResumeData({
      personalInfo: {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        website: ''
      },
      summary: '',
      education: [],
      workExperience: [],
      projects: [],
      skills: [],
      certifications: [],
      template: 'modern',
      aiEnhancement: false
    });
  };

  return {
    resumeData,
    setResumeData,
    lastUsedTemplate,
    setLastUsedTemplate,
    clearResumeData
  };
}
